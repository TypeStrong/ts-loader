import * as crypto from 'crypto';
import * as path from 'path';
import type * as typescript from 'typescript';
import type * as webpack from 'webpack';

import * as constants from './constants';
import {
  buildSolutionReferences,
  getEmitOutput,
  getInputFileNameFromOutput,
  getTypeScriptInstance,
  initializeInstance,
  reportTranspileErrors,
} from './instances';
import type {
  FilePathKey,
  LoaderOptions,
  LoaderOptionsCache,
  LogLevel,
  TSInstance,
} from './interfaces';
import {
  appendSuffixesIfMatch,
  arrify,
  formatErrors,
  isReferencedFile,
} from './utils';
import type { RawSourceMap } from 'source-map';
import { SourceMapConsumer, SourceMapGenerator } from 'source-map';

const loaderOptionsCache: LoaderOptionsCache = {};

/**
 * The entry point for ts-loader
 */
function loader(
  this: webpack.LoaderContext<LoaderOptions>,
  contents: string,
  inputSourceMap?: Record<string, any>
) {
  this.cacheable && this.cacheable();
  const callback = this.async();
  const options = getLoaderOptions(this);
  const instanceOrError = getTypeScriptInstance(options, this);

  if (instanceOrError.error !== undefined) {
    callback(new Error(instanceOrError.error.message));
    return;
  }
  const instance = instanceOrError.instance!;
  buildSolutionReferences(instance, this);
  successLoader(this, contents, callback, instance, inputSourceMap);
}

function successLoader(
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  contents: string,
  callback: ReturnType<webpack.LoaderContext<LoaderOptions>['async']>,
  instance: TSInstance,
  inputSourceMap?: Record<string, any>
) {
  initializeInstance(loaderContext, instance);
  reportTranspileErrors(instance, loaderContext);
  const rawFilePath = path.normalize(loaderContext.resourcePath);

  const filePath =
    instance.loaderOptions.appendTsSuffixTo.length > 0 ||
    instance.loaderOptions.appendTsxSuffixTo.length > 0
      ? appendSuffixesIfMatch(
          {
            '.ts': instance.loaderOptions.appendTsSuffixTo,
            '.tsx': instance.loaderOptions.appendTsxSuffixTo,
          },
          rawFilePath
        )
      : rawFilePath;

  const fileVersion = updateFileInCache(
    instance.loaderOptions,
    filePath,
    contents,
    instance
  );
  const { outputText, sourceMapText } = instance.loaderOptions.transpileOnly
    ? getTranspilationEmit(filePath, contents, instance, loaderContext)
    : getEmit(rawFilePath, filePath, instance, loaderContext);

  // the following function is async, which means it will immediately return and run in the "background"
  // Webpack will be notified when it's finished when the function calls the `callback` method
  makeSourceMapAndFinish(
    sourceMapText,
    outputText,
    filePath,
    contents,
    loaderContext,
    fileVersion,
    callback,
    instance,
    inputSourceMap
  );
}

function makeSourceMapAndFinish(
  sourceMapText: string | undefined,
  outputText: string | undefined,
  filePath: string,
  contents: string,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  fileVersion: number,
  callback: ReturnType<webpack.LoaderContext<LoaderOptions>['async']>,
  instance: TSInstance,
  inputSourceMap?: Record<string, any>
) {
  if (outputText === null || outputText === undefined) {
    setModuleMeta(loaderContext, instance, fileVersion);
    const additionalGuidance = isReferencedFile(instance, filePath)
      ? ' The most common cause for this is having errors when building referenced projects.'
      : !instance.loaderOptions.allowTsInNodeModules &&
        filePath.indexOf('node_modules') !== -1
      ? ' By default, ts-loader will not compile .ts files in node_modules.\n' +
        'You should not need to recompile .ts files there, but if you really want to, use the allowTsInNodeModules option.\n' +
        'See: https://github.com/Microsoft/TypeScript/issues/12358'
      : '';

    callback(
      new Error(
        `TypeScript emitted no output for ${filePath}.${additionalGuidance}`
      ),
      outputText,
      undefined
    );
    return;
  }

  const { sourceMap, output } = makeSourceMap(
    sourceMapText,
    outputText,
    filePath,
    contents,
    loaderContext
  );

  setModuleMeta(loaderContext, instance, fileVersion);

  // there are two cases where we don't need to perform input source map mapping:
  //   - either the ts-compiler did not generate a source map (tsconfig had `sourceMap` set to false)
  //   - or we did not get an input source map
  //
  // in the first case, we simply return undefined.
  // in the second case we only need to return the newly generated source map
  // this avoids that we have to make a possibly expensive call to the source-map lib
  if (sourceMap === undefined || !inputSourceMap) {
    callback(null, output, sourceMap);
    return;
  }

  // otherwise we have to make a mapping to the input source map which is asynchronous
  mapToInputSourceMap(sourceMap, loaderContext, inputSourceMap as RawSourceMap)
    .then(mappedSourceMap => {
      callback(null, output, mappedSourceMap);
    })
    .catch((e: Error) => {
      callback(e);
    });
}

function setModuleMeta(
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  instance: TSInstance,
  fileVersion: number
) {
  // _module.meta is not available inside happypack
  if (
    !instance.loaderOptions.happyPackMode &&
    loaderContext._module!.buildMeta !== undefined
  ) {
    // Make sure webpack is aware that even though the emitted JavaScript may be the same as
    // a previously cached version the TypeScript may be different and therefore should be
    // treated as new
    loaderContext._module!.buildMeta.tsLoaderFileVersion = fileVersion;
  }
}

/**
 * Get a unique hash based on the contents of the options
 * Hash is created from the values converted to strings
 * Values which are functions (such as getCustomTransformers) are
 * converted to strings by this code, which JSON.stringify would not do.
 */
function getOptionsHash(loaderOptions: LoaderOptions) {
  const hash = crypto.createHash('sha256');
  Object.keys(loaderOptions).forEach(key => {
    const value = loaderOptions[key as keyof LoaderOptions];
    if (value !== undefined) {
      const valueString =
        typeof value === 'function' ? value.toString() : JSON.stringify(value);
      hash.update(key + valueString);
    }
  });
  return hash.digest('hex').substring(0, 16);
}

/**
 * either retrieves loader options from the cache
 * or creates them, adds them to the cache and returns
 */
function getLoaderOptions(loaderContext: webpack.LoaderContext<LoaderOptions>) {
  const loaderOptions = loaderContext.getOptions();

  // If no instance name is given in the options, use the hash of the loader options
  // In this way, if different options are given the instances will be different
  const instanceName =
    loaderOptions.instance || 'default_' + getOptionsHash(loaderOptions);

  if (!loaderOptionsCache.hasOwnProperty(instanceName)) {
    loaderOptionsCache[instanceName] = new WeakMap();
  }

  const cache = loaderOptionsCache[instanceName];

  if (cache.has(loaderOptions)) {
    return cache.get(loaderOptions) as LoaderOptions;
  }

  validateLoaderOptions(loaderOptions);

  const options = makeLoaderOptions(instanceName, loaderOptions, loaderContext);

  cache.set(loaderOptions, options);

  return options;
}

type ValidLoaderOptions = keyof LoaderOptions;
const validLoaderOptions: ValidLoaderOptions[] = [
  'silent',
  'logLevel',
  'logInfoToStdOut',
  'instance',
  'compiler',
  'context',
  'configFile',
  'transpileOnly',
  'ignoreDiagnostics',
  'errorFormatter',
  'colors',
  'compilerOptions',
  'appendTsSuffixTo',
  'appendTsxSuffixTo',
  'onlyCompileBundledFiles',
  'happyPackMode',
  'getCustomTransformers',
  'reportFiles',
  'experimentalWatchApi',
  'allowTsInNodeModules',
  'experimentalFileCaching',
  'projectReferences',
  'resolveModuleName',
  'resolveTypeReferenceDirective',
  'useCaseSensitiveFileNames',
];

/**
 * Validate the supplied loader options.
 * At present this validates the option names only; in future we may look at validating the values too
 * @param loaderOptions
 */
function validateLoaderOptions(loaderOptions: LoaderOptions) {
  const loaderOptionKeys = Object.keys(loaderOptions);
  for (let i = 0; i < loaderOptionKeys.length; i++) {
    const option = loaderOptionKeys[i];
    const isUnexpectedOption =
      (validLoaderOptions as string[]).indexOf(option) === -1;
    if (isUnexpectedOption) {
      throw new Error(`ts-loader was supplied with an unexpected loader option: ${option}

Please take a look at the options you are supplying; the following are valid options:
${validLoaderOptions.join(' / ')}
`);
    }
  }

  if (
    loaderOptions.context !== undefined &&
    !path.isAbsolute(loaderOptions.context)
  ) {
    throw new Error(
      `Option 'context' has to be an absolute path. Given '${loaderOptions.context}'.`
    );
  }
}

function makeLoaderOptions(
  instanceName: string,
  loaderOptions: LoaderOptions,
  loaderContext: webpack.LoaderContext<LoaderOptions>
) {
  const hasForkTsCheckerWebpackPlugin =
    loaderContext._compiler?.options.plugins.some(
      plugin =>
        typeof plugin === 'object' &&
        plugin.constructor?.name === 'ForkTsCheckerWebpackPlugin'
    );

  const options = Object.assign(
    {},
    {
      silent: false,
      logLevel: 'WARN',
      logInfoToStdOut: false,
      compiler: 'typescript',
      context: undefined,
      // Set default transpileOnly to true if there is an instance of ForkTsCheckerWebpackPlugin
      transpileOnly: hasForkTsCheckerWebpackPlugin,
      compilerOptions: {},
      appendTsSuffixTo: [],
      appendTsxSuffixTo: [],
      transformers: {},
      happyPackMode: false,
      colors: true,
      onlyCompileBundledFiles: false,
      reportFiles: [],
      // When the watch API usage stabilises look to remove this option and make watch usage the default behaviour when available
      experimentalWatchApi: false,
      allowTsInNodeModules: false,
      experimentalFileCaching: true,
    } as Partial<LoaderOptions>,
    loaderOptions
  );

  options.ignoreDiagnostics = arrify(options.ignoreDiagnostics).map(Number);
  options.logLevel = options.logLevel.toUpperCase() as LogLevel;
  options.instance = instanceName;
  options.configFile = options.configFile || 'tsconfig.json';

  // happypack can be used only together with transpileOnly mode
  options.transpileOnly = options.happyPackMode ? true : options.transpileOnly;

  return options;
}

/**
 * Either add file to the overall files cache or update it in the cache when the file contents have changed
 * Also add the file to the modified files
 */
function updateFileInCache(
  options: LoaderOptions,
  filePath: string,
  contents: string,
  instance: TSInstance
) {
  let fileWatcherEventKind: typescript.FileWatcherEventKind | undefined;
  // Update file contents
  const key = instance.filePathKeyMapper(filePath);
  let file = instance.files.get(key);
  if (file === undefined) {
    file = instance.otherFiles.get(key);
    if (file !== undefined) {
      if (!isReferencedFile(instance, filePath)) {
        instance.otherFiles.delete(key);
        instance.files.set(key, file);
        instance.changedFilesList = true;
      }
    } else {
      if (instance.watchHost !== undefined) {
        fileWatcherEventKind = instance.compiler.FileWatcherEventKind.Created;
      }
      file = { fileName: filePath, version: 0 };
      if (!isReferencedFile(instance, filePath)) {
        instance.files.set(key, file);
        instance.changedFilesList = true;
      }
    }
  }

  if (instance.watchHost !== undefined && contents === undefined) {
    fileWatcherEventKind = instance.compiler.FileWatcherEventKind.Deleted;
  }

  // filePath is a root file as it was passed to the loader. But it
  // could have been found earlier as a dependency of another file. If
  // that is the case, compiling this file changes the structure of
  // the program and we need to increase the instance version.
  //
  // See https://github.com/TypeStrong/ts-loader/issues/943
  if (
    !isReferencedFile(instance, filePath) &&
    !instance.rootFileNames.has(filePath) &&
    // however, be careful not to add files from node_modules unless
    // it is allowed by the options.
    (options.allowTsInNodeModules || filePath.indexOf('node_modules') === -1)
  ) {
    instance.version++;
    instance.rootFileNames.add(filePath);
  }

  if (file.text !== contents) {
    file.version++;
    file.text = contents;
    file.modifiedTime = new Date();
    instance.version++;
    if (
      instance.watchHost !== undefined &&
      fileWatcherEventKind === undefined
    ) {
      fileWatcherEventKind = instance.compiler.FileWatcherEventKind.Changed;
    }
  }

  // Added in case the files were already updated by the watch API
  if (instance.modifiedFiles && instance.modifiedFiles.get(key)) {
    fileWatcherEventKind = instance.compiler.FileWatcherEventKind.Changed;
  }

  if (instance.watchHost !== undefined && fileWatcherEventKind !== undefined) {
    instance.hasUnaccountedModifiedFiles =
      instance.watchHost.invokeFileWatcher(filePath, fileWatcherEventKind) ||
      instance.hasUnaccountedModifiedFiles;
  }

  // push this file to modified files hash.
  if (!instance.modifiedFiles) {
    instance.modifiedFiles = new Map();
  }
  instance.modifiedFiles.set(key, true);

  return file.version;
}

function getEmit(
  rawFilePath: string,
  filePath: string,
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>
) {
  const outputFiles = getEmitOutput(instance, filePath);
  loaderContext.clearDependencies();
  loaderContext.addDependency(rawFilePath);

  const dependencies: string[] = [];
  const addDependency = (file: string) => {
    file = path.resolve(file);
    loaderContext.addDependency(file);
    dependencies.push(file);
  };

  // Make this file dependent on *all* definition files in the program
  if (!isReferencedFile(instance, filePath)) {
    for (const { fileName: defFilePath } of instance.files.values()) {
      if (
        defFilePath.match(constants.dtsDtsxOrDtsDtsxMapRegex) &&
        // Remove the project reference d.ts as we are adding dependency for .ts later
        // This removed extra build pass (resulting in new stats object in initial build)
        !instance.solutionBuilderHost?.getOutputFileKeyFromReferencedProject(
          defFilePath
        )
      ) {
        addDependency(defFilePath);
      }
    }
  }

  // Additionally make this file dependent on all imported files
  const fileDependencies = instance.dependencyGraph.get(
    instance.filePathKeyMapper(filePath)
  );
  if (fileDependencies) {
    for (const { resolvedFileName, originalFileName } of fileDependencies) {
      // In the case of dependencies that are part of a project reference,
      // the real dependency that webpack should watch is the JS output file.
      addDependency(
        getInputFileNameFromOutput(instance, path.resolve(resolvedFileName)) ||
          originalFileName
      );
    }
  }

  addDependenciesFromSolutionBuilder(instance, filePath, addDependency);

  loaderContext._module!.buildMeta.tsLoaderDefinitionFileVersions =
    dependencies.map(
      defFilePath =>
        path.relative(loaderContext.rootContext, defFilePath) +
        '@' +
        (isReferencedFile(instance, defFilePath)
          ? instance
              .solutionBuilderHost!.getInputFileStamp(defFilePath)
              .toString()
          : (
              instance.files.get(instance.filePathKeyMapper(defFilePath)) ||
              instance.otherFiles.get(
                instance.filePathKeyMapper(defFilePath)
              ) || {
                version: '?',
              }
            ).version)
    );

  return getOutputAndSourceMapFromOutputFiles(outputFiles);
}

function getOutputAndSourceMapFromOutputFiles(
  outputFiles: typescript.OutputFile[]
) {
  const outputFile = outputFiles
    .filter(file => file.name.match(constants.jsJsx))
    .pop();
  const outputText = outputFile === undefined ? undefined : outputFile.text;

  const sourceMapFile = outputFiles
    .filter(file => file.name.match(constants.jsJsxMap))
    .pop();
  const sourceMapText =
    sourceMapFile === undefined ? undefined : sourceMapFile.text;
  return { outputText, sourceMapText };
}

function addDependenciesFromSolutionBuilder(
  instance: TSInstance,
  filePath: string,
  addDependency: (file: string) => void
) {
  if (!instance.solutionBuilderHost) {
    return;
  }

  // Add all the input files from the references as
  const resolvedFilePath = instance.filePathKeyMapper(filePath);
  if (!isReferencedFile(instance, filePath)) {
    if (
      instance.configParseResult.fileNames.some(
        f => instance.filePathKeyMapper(f) === resolvedFilePath
      )
    ) {
      addDependenciesFromProjectReferences(
        instance,
        instance.configFilePath!,
        instance.configParseResult.projectReferences,
        addDependency
      );
    }
    return;
  }

  // Referenced file find the config for it
  for (const [
    configFile,
    configInfo,
  ] of instance.solutionBuilderHost.configFileInfo.entries()) {
    if (
      !configInfo.config ||
      !configInfo.config.projectReferences ||
      !configInfo.config.projectReferences.length
    ) {
      continue;
    }
    if (configInfo.outputFileNames) {
      if (!configInfo.outputFileNames.has(resolvedFilePath)) {
        continue;
      }
    } else if (
      !configInfo.config.fileNames.some(
        f => instance.filePathKeyMapper(f) === resolvedFilePath
      )
    ) {
      continue;
    }

    // Depend on all the dts files from the program
    if (configInfo.dtsFiles) {
      configInfo.dtsFiles.forEach(addDependency);
    }
    addDependenciesFromProjectReferences(
      instance,
      configFile,
      configInfo.config.projectReferences,
      addDependency
    );
    break;
  }
}

function addDependenciesFromProjectReferences(
  instance: TSInstance,
  configFile: string,
  projectReferences: readonly typescript.ProjectReference[] | undefined,
  addDependency: (file: string) => void
) {
  if (!projectReferences || !projectReferences.length) {
    return;
  }
  // This is the config for the input file
  const seenMap = new Map<FilePathKey, true>();
  seenMap.set(instance.filePathKeyMapper(configFile), true);

  // Add dependencies to all the input files from the project reference files since building them
  const queue = projectReferences.slice();
  while (true) {
    const currentRef = queue.pop();
    if (!currentRef) {
      break;
    }
    const refConfigFile = instance.filePathKeyMapper(
      instance.compiler.resolveProjectReferencePath(currentRef)
    );
    if (seenMap.has(refConfigFile)) {
      continue;
    }
    const refConfigInfo =
      instance.solutionBuilderHost!.configFileInfo.get(refConfigFile);
    if (!refConfigInfo) {
      continue;
    }
    seenMap.set(refConfigFile, true);
    if (refConfigInfo.config) {
      refConfigInfo.config.fileNames.forEach(addDependency);
      if (refConfigInfo.config.projectReferences) {
        queue.push(...refConfigInfo.config.projectReferences);
      }
    }
  }
}

/**
 * Transpile file
 */
function getTranspilationEmit(
  fileName: string,
  contents: string,
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>
) {
  if (isReferencedFile(instance, fileName)) {
    const outputFiles =
      instance.solutionBuilderHost!.getOutputFilesFromReferencedProjectInput(
        fileName
      );
    addDependenciesFromSolutionBuilder(instance, fileName, file =>
      loaderContext.addDependency(path.resolve(file))
    );
    return getOutputAndSourceMapFromOutputFiles(outputFiles);
  }

  const { outputText, sourceMapText, diagnostics } =
    instance.compiler.transpileModule(contents, {
      compilerOptions: { ...instance.compilerOptions, rootDir: undefined },
      transformers: instance.transformers,
      reportDiagnostics: true,
      fileName,
    });
  const module = loaderContext._module;

  addDependenciesFromSolutionBuilder(instance, fileName, file =>
    loaderContext.addDependency(path.resolve(file))
  );

  // _module.errors is not available inside happypack - see https://github.com/TypeStrong/ts-loader/issues/336
  if (!instance.loaderOptions.happyPackMode) {
    const errors = formatErrors(
      diagnostics,
      instance.loaderOptions,
      instance.colors,
      instance.compiler,
      { module },
      loaderContext.context
    );

    errors.forEach(error => module!.addError(error));
  }

  return { outputText, sourceMapText };
}

function makeSourceMap(
  sourceMapText: string | undefined,
  outputText: string,
  filePath: string,
  contents: string,
  loaderContext: webpack.LoaderContext<LoaderOptions>
) {
  if (sourceMapText === undefined) {
    return { output: outputText, sourceMap: undefined };
  }

  return {
    output: outputText.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, ''),
    sourceMap: Object.assign(JSON.parse(sourceMapText), {
      sources: [loaderContext.remainingRequest],
      file: filePath,
      sourcesContent: [contents],
    }),
  };
}

/**
 * This method maps the newly generated @param{sourceMap} to the input source map.
 * This is required when ts-loader is not the first loader in the Webpack loader chain.
 */
function mapToInputSourceMap(
  sourceMap: RawSourceMap,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  inputSourceMap: RawSourceMap
): Promise<RawSourceMap> {
  return new Promise<RawSourceMap>((resolve, reject) => {
    const inMap: RawSourceMap = {
      file: loaderContext.remainingRequest,
      mappings: inputSourceMap.mappings,
      names: inputSourceMap.names,
      sources: inputSourceMap.sources,
      sourceRoot: inputSourceMap.sourceRoot,
      sourcesContent: inputSourceMap.sourcesContent,
      version: inputSourceMap.version,
    };
    Promise.all([
      new SourceMapConsumer(inMap),
      new SourceMapConsumer(sourceMap),
    ])
      .then(sourceMapConsumers => {
        try {
          const generator = SourceMapGenerator.fromSourceMap(
            sourceMapConsumers[1]
          );
          generator.applySourceMap(sourceMapConsumers[0]);
          const mappedSourceMap = generator.toJSON();

          // before resolving, we free memory by calling destroy on the source map consumers
          sourceMapConsumers.forEach(sourceMapConsumer =>
            sourceMapConsumer.destroy()
          );
          resolve(mappedSourceMap);
        } catch (e) {
          //before rejecting, we free memory by calling destroy on the source map consumers
          sourceMapConsumers.forEach(sourceMapConsumer =>
            sourceMapConsumer.destroy()
          );
          reject(e);
        }
      })
      .catch(reject);
  });
}

export = loader;

/**
 * expose public types via declaration merging
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace loader {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface Options extends LoaderOptions {}
}
