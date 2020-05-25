import * as crypto from 'crypto';
import * as loaderUtils from 'loader-utils';
import * as path from 'path';
import * as typescript from 'typescript';
import * as webpack from 'webpack';

import * as constants from './constants';
import {
  buildSolutionReferences,
  getEmitOutput,
  getInputFileNameFromOutput,
  getTypeScriptInstance,
  initializeInstance,
  isReferencedFile,
  reportTranspileErrors,
} from './instances';
import {
  LoaderOptions,
  LoaderOptionsCache,
  LogLevel,
  TSFile,
  TSInstance,
} from './interfaces';
import {
  appendSuffixesIfMatch,
  arrify,
  formatErrors,
  getAndCacheOutputJSFileName,
  getAndCacheProjectReference,
  validateSourceMapOncePerProject,
} from './utils';

const webpackInstances: webpack.Compiler[] = [];
const loaderOptionsCache: LoaderOptionsCache = {};

/**
 * The entry point for ts-loader
 */
function loader(this: webpack.loader.LoaderContext, contents: string) {
  this.cacheable && this.cacheable();
  const callback = this.async() as webpack.loader.loaderCallback;
  const options = getLoaderOptions(this);
  const instanceOrError = getTypeScriptInstance(options, this);

  if (instanceOrError.error !== undefined) {
    callback(new Error(instanceOrError.error.message));
    return;
  }
  const instance = instanceOrError.instance!;
  buildSolutionReferences(instance, this);
  successLoader(this, contents, callback, instance);
}

function successLoader(
  loaderContext: webpack.loader.LoaderContext,
  contents: string,
  callback: webpack.loader.loaderCallback,
  instance: TSInstance
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
  const referencedProject = getAndCacheProjectReference(filePath, instance);
  if (referencedProject !== undefined) {
    const [relativeProjectConfigPath, relativeFilePath] = [
      path.relative(
        loaderContext.rootContext,
        referencedProject.sourceFile.fileName
      ),
      path.relative(loaderContext.rootContext, filePath),
    ];
    if (referencedProject.commandLine.options.outFile !== undefined) {
      throw new Error(
        `The referenced project at ${relativeProjectConfigPath} is using ` +
          `the outFile' option, which is not supported with ts-loader.`
      );
    }

    const jsFileName = getAndCacheOutputJSFileName(
      filePath,
      referencedProject,
      instance
    );

    const relativeJSFileName = path.relative(
      loaderContext.rootContext,
      jsFileName
    );
    if (!instance.compiler.sys.fileExists(jsFileName)) {
      throw new Error(
        `Could not find output JavaScript file for input ` +
          `${relativeFilePath} (looked at ${relativeJSFileName}).\n` +
          `The input file is part of a project reference located at ` +
          `${relativeProjectConfigPath}, so ts-loader is looking for the ` +
          'project’s pre-built output on disk. Try running `tsc --build` ' +
          'to build project references.'
      );
    }

    // Since the output JS file is being read from disk instead of using the
    // input TS file, we need to tell the loader that the compilation doesn’t
    // actually depend on the current file, but depends on the JS file instead.
    loaderContext.clearDependencies();
    loaderContext.addDependency(jsFileName);

    validateSourceMapOncePerProject(
      instance,
      loaderContext,
      jsFileName,
      referencedProject
    );

    const mapFileName = jsFileName + '.map';
    const outputText = instance.compiler.sys.readFile(jsFileName);
    const sourceMapText = instance.compiler.sys.readFile(mapFileName);
    makeSourceMapAndFinish(
      sourceMapText,
      outputText,
      filePath,
      contents,
      loaderContext,
      fileVersion,
      callback,
      instance
    );
  } else {
    const { outputText, sourceMapText } = instance.loaderOptions.transpileOnly
      ? getTranspilationEmit(filePath, contents, instance, loaderContext)
      : getEmit(rawFilePath, filePath, instance, loaderContext);

    makeSourceMapAndFinish(
      sourceMapText,
      outputText,
      filePath,
      contents,
      loaderContext,
      fileVersion,
      callback,
      instance
    );
  }
}

function makeSourceMapAndFinish(
  sourceMapText: string | undefined,
  outputText: string | undefined,
  filePath: string,
  contents: string,
  loaderContext: webpack.loader.LoaderContext,
  fileVersion: number,
  callback: webpack.loader.loaderCallback,
  instance: TSInstance
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
  callback(null, output, sourceMap);
}

function setModuleMeta(
  loaderContext: webpack.loader.LoaderContext,
  instance: TSInstance,
  fileVersion: number
) {
  // _module.meta is not available inside happypack
  if (
    !instance.loaderOptions.happyPackMode &&
    loaderContext._module.buildMeta !== undefined
  ) {
    // Make sure webpack is aware that even though the emitted JavaScript may be the same as
    // a previously cached version the TypeScript may be different and therefore should be
    // treated as new
    loaderContext._module.buildMeta.tsLoaderFileVersion = fileVersion;
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
  Object.values(loaderOptions).map((v: any) => {
    if (v) {
      hash.update(v.toString());
    }
  });
  return hash.digest('hex').substring(0, 16);
}

/**
 * either retrieves loader options from the cache
 * or creates them, adds them to the cache and returns
 */
function getLoaderOptions(loaderContext: webpack.loader.LoaderContext) {
  // differentiate the TypeScript instance based on the webpack instance
  let webpackIndex = webpackInstances.indexOf(loaderContext._compiler);
  if (webpackIndex === -1) {
    webpackIndex = webpackInstances.push(loaderContext._compiler) - 1;
  }

  const loaderOptions =
    loaderUtils.getOptions<LoaderOptions>(loaderContext) ||
    ({} as LoaderOptions);

  // If no instance name is given in the options, use the hash of the loader options
  // In this way, if different options are given the instances will be different
  const instanceName =
    webpackIndex +
    '_' +
    (loaderOptions.instance || 'default_' + getOptionsHash(loaderOptions));

  if (!loaderOptionsCache.hasOwnProperty(instanceName)) {
    loaderOptionsCache[instanceName] = new WeakMap();
  }

  const cache = loaderOptionsCache[instanceName];

  if (cache.has(loaderOptions)) {
    return cache.get(loaderOptions) as LoaderOptions;
  }

  validateLoaderOptions(loaderOptions);

  const options = makeLoaderOptions(instanceName, loaderOptions);

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

function makeLoaderOptions(instanceName: string, loaderOptions: LoaderOptions) {
  const options = Object.assign(
    {},
    {
      silent: false,
      logLevel: 'WARN',
      logInfoToStdOut: false,
      compiler: 'typescript',
      configFile: 'tsconfig.json',
      context: undefined,
      transpileOnly: false,
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
  let file = instance.files.get(filePath);
  if (file === undefined) {
    file = instance.otherFiles.get(filePath);
    if (file !== undefined) {
      if (!isReferencedFile(instance, filePath)) {
        instance.otherFiles.delete(filePath);
        instance.files.set(filePath, file);
        instance.changedFilesList = true;
      }
    } else {
      if (
        instance.watchHost !== undefined ||
        instance.solutionBuilderHost !== undefined
      ) {
        fileWatcherEventKind = instance.compiler.FileWatcherEventKind.Created;
      }
      file = { version: 0 };
      if (!isReferencedFile(instance, filePath)) {
        instance.files.set(filePath, file);
        instance.changedFilesList = true;
      } else {
        instance.otherFiles.set(filePath, file);
      }
    }
  }

  if (
    (instance.watchHost !== undefined ||
      instance.solutionBuilderHost !== undefined) &&
    contents === undefined
  ) {
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
      (instance.watchHost !== undefined ||
        instance.solutionBuilderHost !== undefined) &&
      fileWatcherEventKind === undefined
    ) {
      fileWatcherEventKind = instance.compiler.FileWatcherEventKind.Changed;
    }
  }

  if (instance.watchHost !== undefined && fileWatcherEventKind !== undefined) {
    instance.hasUnaccountedModifiedFiles = true;
    instance.watchHost.invokeFileWatcher(filePath, fileWatcherEventKind);
    instance.watchHost.invokeDirectoryWatcher(path.dirname(filePath), filePath);
  }

  if (
    instance.solutionBuilderHost !== undefined &&
    fileWatcherEventKind !== undefined
  ) {
    instance.solutionBuilderHost.invokeFileWatcher(
      filePath,
      fileWatcherEventKind
    );
    instance.solutionBuilderHost.invokeDirectoryWatcher(
      path.dirname(filePath),
      filePath
    );
  }

  // push this file to modified files hash.
  if (!instance.modifiedFiles) {
    instance.modifiedFiles = new Map<string, TSFile>();
  }
  instance.modifiedFiles.set(filePath, file);

  return file.version;
}

function getEmit(
  rawFilePath: string,
  filePath: string,
  instance: TSInstance,
  loaderContext: webpack.loader.LoaderContext
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
    for (const defFilePath of instance.files.keys()) {
      if (
        defFilePath.match(constants.dtsDtsxOrDtsDtsxMapRegex) &&
        // Remove the project reference d.ts as we are adding dependency for .ts later
        // This removed extra build pass (resulting in new stats object in initial build)
        (!instance.solutionBuilderHost ||
          instance.solutionBuilderHost.getOutputFileFromReferencedProject(
            defFilePath
          ) !== undefined)
      ) {
        addDependency(defFilePath);
      }
    }
  }

  // Additionally make this file dependent on all imported files
  const fileDependencies = instance.dependencyGraph[filePath];
  if (fileDependencies) {
    for (const { resolvedFileName, originalFileName } of fileDependencies) {
      const projectReference = getAndCacheProjectReference(
        resolvedFileName,
        instance
      );
      // In the case of dependencies that are part of a project reference,
      // the real dependency that webpack should watch is the JS output file.
      if (projectReference !== undefined) {
        addDependency(
          getAndCacheOutputJSFileName(
            resolvedFileName,
            projectReference,
            instance
          )
        );
      } else {
        addDependency(
          getInputFileNameFromOutput(
            instance,
            path.resolve(resolvedFileName)
          ) || originalFileName
        );
      }
    }
  }

  addDependenciesFromSolutionBuilder(instance, filePath, addDependency);

  loaderContext._module.buildMeta.tsLoaderDefinitionFileVersions = dependencies.map(
    defFilePath =>
      path.relative(loaderContext.rootContext, defFilePath) +
      '@' +
      (
        instance.files.get(defFilePath) ||
        instance.otherFiles.get(defFilePath) || { version: '?' }
      ).version
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
  const resolvedFilePath = path.resolve(filePath);
  if (!isReferencedFile(instance, filePath)) {
    if (
      instance.configParseResult.fileNames.some(
        f => path.resolve(f) === resolvedFilePath
      )
    ) {
      addDependenciesFromProjectReferences(
        instance,
        path.resolve(instance.configFilePath!),
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
        f => path.resolve(f) === resolvedFilePath
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
  const seenMap = new Map<string, true>();
  seenMap.set(configFile, true);

  // Add dependencies to all the input files from the project reference files since building them
  const queue = projectReferences.slice();
  while (true) {
    const currentRef = queue.pop();
    if (!currentRef) {
      break;
    }
    const refConfigFile = path.resolve(
      instance.compiler.resolveProjectReferencePath(currentRef)
    );
    if (seenMap.has(refConfigFile)) {
      continue;
    }
    const refConfigInfo = instance.solutionBuilderHost!.configFileInfo.get(
      refConfigFile
    );
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
  loaderContext: webpack.loader.LoaderContext
) {
  if (isReferencedFile(instance, fileName)) {
    const outputFiles = instance.solutionBuilderHost!.getOutputFilesFromReferencedProjectInput(
      fileName
    );
    addDependenciesFromSolutionBuilder(instance, fileName, file =>
      loaderContext.addDependency(path.resolve(file))
    );
    return getOutputAndSourceMapFromOutputFiles(outputFiles);
  }

  const {
    outputText,
    sourceMapText,
    diagnostics,
  } = instance.compiler.transpileModule(contents, {
    compilerOptions: { ...instance.compilerOptions, rootDir: undefined },
    transformers: instance.transformers,
    reportDiagnostics: true,
    fileName,
  });

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
      { module: loaderContext._module },
      loaderContext.context
    );

    loaderContext._module.errors.push(...errors);
  }

  return { outputText, sourceMapText };
}

function makeSourceMap(
  sourceMapText: string | undefined,
  outputText: string,
  filePath: string,
  contents: string,
  loaderContext: webpack.loader.LoaderContext
) {
  if (sourceMapText === undefined) {
    return { output: outputText, sourceMap: undefined };
  }

  return {
    output: outputText.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, ''),
    sourceMap: Object.assign(JSON.parse(sourceMapText), {
      sources: [loaderUtils.getRemainingRequest(loaderContext)],
      file: filePath,
      sourcesContent: [contents],
    }),
  };
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
