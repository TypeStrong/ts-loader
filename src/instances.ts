import * as chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import type * as typescript from 'typescript';
import * as webpack from 'webpack';

import { makeAfterCompile } from './after-compile';
import { getCompiler, getCompilerOptions } from './compilerSetup';
import { getConfigFile, getConfigParseResult } from './config';
import { dtsDtsxOrDtsDtsxMapRegex, EOL, tsTsxRegex } from './constants';
import { getTSInstanceFromCache, setTSInstanceInCache } from './instance-cache';
import {
  FilePathKey,
  LoaderOptions,
  TSFiles,
  TSInstance,
  WebpackLoaderContext,
} from './interfaces';
import * as logger from './logger';
import {
  getSolutionErrors,
  makeServicesHost,
  makeSolutionBuilderHost,
  makeWatchHost,
} from './servicesHost';
import {
  appendSuffixesIfMatch,
  ensureProgram,
  formatErrors,
  isReferencedFile,
  makeError,
  supportsSolutionBuild,
  useCaseSensitiveFileNames,
} from './utils';
import { makeWatchRun } from './watch-run';

const instancesBySolutionBuilderConfigs = new Map<FilePathKey, TSInstance>();

/**
 * The loader is executed once for each file seen by webpack. However, we need to keep
 * a persistent instance of TypeScript that contains all of the files in the program
 * along with definition files and options. This function either creates an instance
 * or returns the existing one. Multiple instances are possible by using the
 * `instance` property.
 */
export function getTypeScriptInstance(
  loaderOptions: LoaderOptions,
  loader: WebpackLoaderContext
): { instance?: TSInstance; error?: webpack.WebpackError } {
  const existing = getTSInstanceFromCache(
    loader._compiler,
    loaderOptions.instance
  );
  if (existing) {
    if (!existing.initialSetupPending) {
      ensureProgram(existing);
    }
    return { instance: existing };
  }

  const level =
    loaderOptions.colors && chalk.supportsColor ? chalk.supportsColor.level : 0;
  const colors = new chalk.Instance({ level });
  const log = logger.makeLogger(loaderOptions, colors);
  const compiler = getCompiler(loaderOptions, log);

  if (compiler.errorMessage !== undefined) {
    return {
      error: makeError(loaderOptions, colors.red(compiler.errorMessage), ''),
    };
  }

  return successfulTypeScriptInstance(
    loaderOptions,
    loader,
    log,
    colors,
    compiler.compiler!,
    compiler.compilerCompatible!,
    compiler.compilerDetailsLogMessage!
  );
}

function createFilePathKeyMapper(
  compiler: typeof typescript,
  loaderOptions: LoaderOptions
) {
  // Cache file path key - a map lookup is much faster than filesystem/regex operations & the result will never change
  const filePathMapperCache = new Map<string, FilePathKey>();
  // FileName lowercasing copied from typescript
  const fileNameLowerCaseRegExp = /[^\u0130\u0131\u00DFa-z0-9\\/:\-_\. ]+/g;
  return useCaseSensitiveFileNames(compiler, loaderOptions)
    ? pathResolve
    : toFileNameLowerCase;

  function pathResolve(filePath: string) {
    let cachedPath = filePathMapperCache.get(filePath);
    if (!cachedPath) {
      cachedPath = path.resolve(filePath) as FilePathKey;
      filePathMapperCache.set(filePath, cachedPath);
    }
    return cachedPath;
  }

  function toFileNameLowerCase(filePath: string) {
    let cachedPath = filePathMapperCache.get(filePath);
    if (!cachedPath) {
      const filePathKey = pathResolve(filePath);
      cachedPath = fileNameLowerCaseRegExp.test(filePathKey)
        ? (filePathKey.replace(fileNameLowerCaseRegExp, ch =>
            ch.toLowerCase()
          ) as FilePathKey)
        : filePathKey;
      filePathMapperCache.set(filePath, cachedPath);
    }
    return cachedPath;
  }
}

function successfulTypeScriptInstance(
  loaderOptions: LoaderOptions,
  loader: WebpackLoaderContext,
  log: logger.Logger,
  colors: chalk.Chalk,
  compiler: typeof typescript,
  compilerCompatible: boolean,
  compilerDetailsLogMessage: string
) {
  const configFileAndPath = getConfigFile(
    compiler,
    colors,
    loader,
    loaderOptions,
    compilerCompatible,
    log,
    compilerDetailsLogMessage!
  );

  if (configFileAndPath.configFileError !== undefined) {
    const { message, file } = configFileAndPath.configFileError;
    return {
      error: makeError(
        loaderOptions,
        colors.red('error while reading tsconfig.json:' + EOL + message),
        file
      ),
    };
  }

  const { configFilePath, configFile } = configFileAndPath;
  const filePathKeyMapper = createFilePathKeyMapper(compiler, loaderOptions);
  if (configFilePath && loaderOptions.projectReferences) {
    const configFileKey = filePathKeyMapper(configFilePath);
    const existing = getExistingSolutionBuilderHost(configFileKey);
    if (existing) {
      // Reuse the instance if config file for project references is shared.
      setTSInstanceInCache(loader._compiler, loaderOptions.instance, existing);
      return { instance: existing };
    }
  }

  const module = loader._module;
  const basePath = loaderOptions.context || path.dirname(configFilePath || '');
  const configParseResult = getConfigParseResult(
    compiler,
    configFile,
    basePath,
    configFilePath,
    loaderOptions
  );

  if (configParseResult.errors.length > 0 && !loaderOptions.happyPackMode) {
    const errors = formatErrors(
      configParseResult.errors,
      loaderOptions,
      colors,
      compiler,
      { file: configFilePath },
      loader.context
    );

    errors.forEach(error => module.addError(error));

    return {
      error: makeError(
        loaderOptions,
        colors.red('error while parsing tsconfig.json'),
        configFilePath || ''
      ),
    };
  }

  const compilerOptions = getCompilerOptions(configParseResult, compiler);
  const rootFileNames = new Set<string>();
  const files: TSFiles = new Map();
  const otherFiles: TSFiles = new Map();

  const appendTsTsxSuffixesIfRequired =
    loaderOptions.appendTsSuffixTo.length > 0 ||
    loaderOptions.appendTsxSuffixTo.length > 0
      ? (filePath: string) =>
          appendSuffixesIfMatch(
            {
              '.ts': loaderOptions.appendTsSuffixTo,
              '.tsx': loaderOptions.appendTsxSuffixTo,
            },
            filePath
          )
      : (filePath: string) => filePath;

  if (loaderOptions.transpileOnly) {
    // quick return for transpiling
    // we do need to check for any issues with TS options though
    const transpileInstance: TSInstance = {
      compiler,
      compilerOptions,
      appendTsTsxSuffixesIfRequired,
      loaderOptions,
      rootFileNames,
      files,
      otherFiles,
      version: 0,
      program: undefined, // temporary, to be set later
      dependencyGraph: new Map(),
      transformers: {} as typescript.CustomTransformers, // this is only set temporarily, custom transformers are created further down
      colors,
      initialSetupPending: true,
      reportTranspileErrors: true,
      configFilePath,
      configParseResult,
      log,
      filePathKeyMapper,
    };

    setTSInstanceInCache(
      loader._compiler,
      loaderOptions.instance,
      transpileInstance
    );
    return { instance: transpileInstance };
  }

  // Load initial files (core lib files, any files specified in tsconfig.json)
  let normalizedFilePath: string;
  try {
    const filesToLoad = loaderOptions.onlyCompileBundledFiles
      ? configParseResult.fileNames.filter(fileName =>
          dtsDtsxOrDtsDtsxMapRegex.test(fileName)
        )
      : configParseResult.fileNames;
    filesToLoad.forEach(filePath => {
      normalizedFilePath = path.normalize(filePath);
      files.set(filePathKeyMapper(normalizedFilePath), {
        fileName: normalizedFilePath,
        text: fs.readFileSync(normalizedFilePath, 'utf-8'),
        version: 0,
      });
      rootFileNames.add(normalizedFilePath);
    });
  } catch (exc) {
    return {
      error: makeError(
        loaderOptions,
        colors.red(
          `A file specified in tsconfig.json could not be found: ${normalizedFilePath!}`
        ),
        normalizedFilePath!
      ),
    };
  }

  const instance: TSInstance = {
    compiler,
    compilerOptions,
    appendTsTsxSuffixesIfRequired,
    loaderOptions,
    rootFileNames,
    files,
    otherFiles,
    languageService: null,
    version: 0,
    transformers: {} as typescript.CustomTransformers, // this is only set temporarily, custom transformers are created further down
    dependencyGraph: new Map(),
    colors,
    initialSetupPending: true,
    configFilePath,
    configParseResult,
    log,
    filePathKeyMapper,
  };

  setTSInstanceInCache(loader._compiler, loaderOptions.instance, instance);
  return { instance };
}

function getExistingSolutionBuilderHost(key: FilePathKey) {
  const existing = instancesBySolutionBuilderConfigs.get(key);
  if (existing) return existing;
  for (const instance of instancesBySolutionBuilderConfigs.values()) {
    if (instance.solutionBuilderHost!.configFileInfo.has(key)) {
      return instance;
    }
  }
  return undefined;
}

function addAssetHooks(loader: WebpackLoaderContext, instance: TSInstance) {
  // makeAfterCompile is a closure.  It returns a function which closes over the variable checkAllFilesForErrors
  // We need to get the function once and then reuse it, otherwise it will be recreated each time
  // and all files will always be checked.
  const cachedMakeAfterCompile = makeAfterCompile(
    instance,
    instance.configFilePath
  );

  const makeAssetsCallback = (compilation: webpack.Compilation) => {
    compilation.hooks.afterProcessAssets.tap('ts-loader', () =>
      cachedMakeAfterCompile(compilation, () => {
        return null;
      })
    );
  };

  // We need to add the hook above for each run.
  // For the first run, we just need to add the hook to loader._compilation
  makeAssetsCallback(loader._compilation);

  // For future calls in watch mode we need to watch for a new compilation and add the hook
  loader._compiler.hooks.compilation.tap('ts-loader', makeAssetsCallback);

  // It may be better to add assets at the processAssets stage (https://webpack.js.org/api/compilation-hooks/#processassets)
  // This requires Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL, which does not exist in webpack4
  // Consider changing this when ts-loader is built using webpack5
}

export function initializeInstance(
  loader: WebpackLoaderContext,
  instance: TSInstance
) {
  if (!instance.initialSetupPending) {
    return;
  }

  instance.initialSetupPending = false;

  // same strategy as https://github.com/s-panferov/awesome-typescript-loader/pull/531/files
  let { getCustomTransformers: customerTransformers } = instance.loaderOptions;
  let getCustomTransformers = Function.prototype;

  if (typeof customerTransformers === 'function') {
    getCustomTransformers = customerTransformers;
  } else if (typeof customerTransformers === 'string') {
    try {
      customerTransformers = require(customerTransformers);
    } catch (err) {
      throw new Error(
        `Failed to load customTransformers from "${instance.loaderOptions.getCustomTransformers}": ${err.message}`
      );
    }

    if (typeof customerTransformers !== 'function') {
      throw new Error(
        `Custom transformers in "${
          instance.loaderOptions.getCustomTransformers
        }" should export a function, got ${typeof getCustomTransformers}`
      );
    }
    getCustomTransformers = customerTransformers;
  }

  if (instance.loaderOptions.transpileOnly) {
    const program = (instance.program =
      instance.configParseResult.projectReferences !== undefined
        ? instance.compiler.createProgram({
            rootNames: instance.configParseResult.fileNames,
            options: instance.configParseResult.options,
            projectReferences: instance.configParseResult.projectReferences,
          })
        : instance.compiler.createProgram([], instance.compilerOptions));

    instance.transformers = getCustomTransformers(program);
    // Setup watch run for solution building
    if (instance.solutionBuilderHost) {
      addAssetHooks(loader, instance);
      loader._compiler.hooks.watchRun.tapAsync(
        'ts-loader',
        makeWatchRun(instance, loader)
      );
    }
  } else {
    if (!loader._compiler.hooks) {
      throw new Error(
        "You may be using an old version of webpack; please check you're using at least version 4"
      );
    }

    if (instance.loaderOptions.experimentalWatchApi) {
      instance.log.logInfo('Using watch api');

      // If there is api available for watch, use it instead of language service
      instance.watchHost = makeWatchHost(
        getScriptRegexp(instance),
        loader,
        instance,
        instance.configParseResult.projectReferences
      );
      instance.watchOfFilesAndCompilerOptions = instance.compiler.createWatchProgram(
        instance.watchHost
      );
      instance.builderProgram = instance.watchOfFilesAndCompilerOptions.getProgram();
      instance.program = instance.builderProgram.getProgram();

      instance.transformers = getCustomTransformers(instance.program);
    } else {
      instance.servicesHost = makeServicesHost(
        getScriptRegexp(instance),
        loader,
        instance,
        instance.configParseResult.projectReferences
      );

      instance.languageService = instance.compiler.createLanguageService(
        instance.servicesHost,
        instance.compiler.createDocumentRegistry()
      );

      instance.transformers = getCustomTransformers(
        instance.languageService!.getProgram()
      );
    }

    addAssetHooks(loader, instance);

    loader._compiler.hooks.watchRun.tapAsync(
      'ts-loader',
      makeWatchRun(instance, loader)
    );
  }
}

function getScriptRegexp(instance: TSInstance) {
  // If resolveJsonModules is set, we should accept json files
  if (instance.configParseResult.options.resolveJsonModule) {
    // if allowJs is set then we should accept js(x) files
    return instance.configParseResult.options.allowJs === true
      ? /\.tsx?$|\.json$|\.jsx?$/i
      : /\.tsx?$|\.json$/i;
  }
  // if allowJs is set then we should accept js(x) files
  return instance.configParseResult.options.allowJs === true
    ? /\.tsx?$|\.jsx?$/i
    : /\.tsx?$/i;
}

export function reportTranspileErrors(
  instance: TSInstance,
  loader: WebpackLoaderContext
) {
  if (!instance.reportTranspileErrors) {
    return;
  }
  const module = loader._module;
  instance.reportTranspileErrors = false;
  // happypack does not have _module.errors - see https://github.com/TypeStrong/ts-loader/issues/336
  if (!instance.loaderOptions.happyPackMode) {
    const solutionErrors: webpack.WebpackError[] = getSolutionErrors(
      instance,
      loader.context
    );
    const diagnostics = instance.program!.getOptionsDiagnostics();
    const errors = formatErrors(
      diagnostics,
      instance.loaderOptions,
      instance.colors,
      instance.compiler,
      { file: instance.configFilePath || 'tsconfig.json' },
      loader.context
    );

    [...solutionErrors, ...errors].forEach(error => module.addError(error));
  }
}

export function buildSolutionReferences(
  instance: TSInstance,
  loader: WebpackLoaderContext
) {
  if (!supportsSolutionBuild(instance)) {
    return;
  }
  if (!instance.solutionBuilderHost) {
    // Use solution builder
    instance.log.logInfo('Using SolutionBuilder api');
    const scriptRegex = getScriptRegexp(instance);
    instance.solutionBuilderHost = makeSolutionBuilderHost(
      scriptRegex,
      loader,
      instance
    );
    const solutionBuilder = instance.compiler.createSolutionBuilderWithWatch(
      instance.solutionBuilderHost,
      instance.configParseResult.projectReferences!.map(ref => ref.path),
      { verbose: true }
    );
    solutionBuilder.build();
    instance.solutionBuilderHost.ensureAllReferenceTimestamps();
    instancesBySolutionBuilderConfigs.set(
      instance.filePathKeyMapper(instance.configFilePath!),
      instance
    );
  } else {
    instance.solutionBuilderHost.buildReferences();
  }
}

export function forEachResolvedProjectReference<T>(
  resolvedProjectReferences:
    | readonly (typescript.ResolvedProjectReference | undefined)[]
    | undefined,
  cb: (
    resolvedProjectReference: typescript.ResolvedProjectReference
  ) => T | undefined
): T | undefined {
  let seenResolvedRefs: typescript.ResolvedProjectReference[] | undefined;
  return worker(resolvedProjectReferences);
  function worker(
    resolvedRefs:
      | readonly (typescript.ResolvedProjectReference | undefined)[]
      | undefined
  ): T | undefined {
    if (resolvedRefs) {
      for (const resolvedRef of resolvedRefs) {
        if (!resolvedRef) {
          continue;
        }
        if (
          seenResolvedRefs &&
          seenResolvedRefs.some(seenRef => seenRef === resolvedRef)
        ) {
          // ignore recursives
          continue;
        }

        (seenResolvedRefs || (seenResolvedRefs = [])).push(resolvedRef);
        const result = cb(resolvedRef) || worker(resolvedRef.references);
        if (result) {
          return result;
        }
      }
    }
    return undefined;
  }
}

// This code is here as a temporary holder
function fileExtensionIs(fileName: string, ext: string) {
  return fileName.endsWith(ext);
}

function rootDirOfOptions(
  instance: TSInstance,
  configFile: typescript.ParsedCommandLine
) {
  return (
    configFile.options.rootDir ||
    (instance.compiler as any).getDirectoryPath(
      configFile.options.configFilePath
    )
  );
}

function getOutputPathWithoutChangingExt(
  instance: TSInstance,
  inputFileName: string,
  configFile: typescript.ParsedCommandLine,
  ignoreCase: boolean,
  outputDir: string | undefined
) {
  return outputDir
    ? (instance.compiler as any).resolvePath(
        outputDir,
        (instance.compiler as any).getRelativePathFromDirectory(
          rootDirOfOptions(instance, configFile),
          inputFileName,
          ignoreCase
        )
      )
    : inputFileName;
}

function getOutputJSFileName(
  instance: TSInstance,
  inputFileName: string,
  configFile: typescript.ParsedCommandLine,
  ignoreCase: boolean
) {
  if (configFile.options.emitDeclarationOnly) {
    return undefined;
  }
  const isJsonFile = fileExtensionIs(inputFileName, '.json');
  const outputFileName = (instance.compiler as any).changeExtension(
    getOutputPathWithoutChangingExt(
      instance,
      inputFileName,
      configFile,
      ignoreCase,
      configFile.options.outDir
    ),
    isJsonFile
      ? '.json'
      : fileExtensionIs(inputFileName, '.tsx') &&
        configFile.options.jsx === instance.compiler.JsxEmit.Preserve
      ? '.jsx'
      : '.js'
  );
  return !isJsonFile ||
    (instance.compiler as any).comparePaths(
      inputFileName,
      outputFileName,
      configFile.options.configFilePath,
      ignoreCase
    ) !== (instance.compiler as any).Comparison.EqualTo
    ? outputFileName
    : undefined;
}

export function getOutputFileNames(
  instance: TSInstance,
  configFile: typescript.ParsedCommandLine,
  inputFileName: string
): string[] {
  const ignoreCase = !useCaseSensitiveFileNames(
    instance.compiler,
    instance.loaderOptions
  );
  if ((instance.compiler as any).getOutputFileNames) {
    return (instance.compiler as any).getOutputFileNames(
      configFile,
      inputFileName,
      ignoreCase
    );
  }
  const outputs: string[] = [];
  const addOutput = (fileName: string | undefined) =>
    fileName && outputs.push(fileName);
  const js = getOutputJSFileName(
    instance,
    inputFileName,
    configFile,
    ignoreCase
  );
  addOutput(js);
  if (!fileExtensionIs(inputFileName, '.json')) {
    if (js && configFile.options.sourceMap) {
      addOutput(`${js}.map`);
    }
    if (
      (configFile.options.declaration || configFile.options.composite) &&
      (instance.compiler as any).hasTSFileExtension(inputFileName)
    ) {
      const dts = (instance.compiler as any).getOutputDeclarationFileName(
        inputFileName,
        configFile,
        ignoreCase
      );
      addOutput(dts);
      if (configFile.options.declarationMap) {
        addOutput(`${dts}.map`);
      }
    }
  }

  return outputs;
}

export function getInputFileNameFromOutput(
  instance: TSInstance,
  filePath: string
): string | undefined {
  if (filePath.match(tsTsxRegex) && !fileExtensionIs(filePath, '.d.ts')) {
    return undefined;
  }
  if (instance.solutionBuilderHost) {
    return instance.solutionBuilderHost.getInputFileNameFromOutput(filePath);
  }
  const program = ensureProgram(instance);
  return (
    program &&
    program.getResolvedProjectReferences &&
    forEachResolvedProjectReference(
      program.getResolvedProjectReferences(),
      ({ commandLine }) => {
        const { options, fileNames } = commandLine;
        if (!options.outFile && !options.out) {
          const input = fileNames.find(file =>
            getOutputFileNames(instance, commandLine, file).find(
              name => path.resolve(name) === filePath
            )
          );
          return input && path.resolve(input);
        }
        return undefined;
      }
    )
  );
}

export function getEmitFromWatchHost(instance: TSInstance, filePath?: string) {
  const program = ensureProgram(instance);
  const builderProgram = instance.builderProgram;
  if (builderProgram && program) {
    if (filePath) {
      const existing = instance.watchHost!.outputFiles.get(
        instance.filePathKeyMapper(filePath)
      );
      if (existing) {
        return existing;
      }
    }

    const outputFiles: typescript.OutputFile[] = [];
    const writeFile: typescript.WriteFileCallback = (
      fileName,
      text,
      writeByteOrderMark
    ) => {
      if (fileName.endsWith('.tsbuildinfo')) {
        instance.watchHost!.tsbuildinfo = {
          name: fileName,
          writeByteOrderMark,
          text,
        };
      } else {
        outputFiles.push({ name: fileName, writeByteOrderMark, text });
      }
    };

    const sourceFile = filePath ? program.getSourceFile(filePath) : undefined;
    // Try emit Next file
    while (true) {
      const result = builderProgram.emitNextAffectedFile(
        writeFile,
        /*cancellationToken*/ undefined,
        /*emitOnlyDtsFiles*/ false,
        instance.transformers
      );
      if (!result) {
        break;
      }

      // Only put the output file in the cache if the source came from webpack and
      // was processed by the loaders
      if (result.affected === sourceFile) {
        instance.watchHost!.outputFiles.set(
          instance.filePathKeyMapper(
            (result.affected as typescript.SourceFile).fileName
          ),
          outputFiles.slice()
        );
        return outputFiles;
      }
    }
  }
  return undefined;
}

export function getEmitOutput(instance: TSInstance, filePath: string) {
  if (fileExtensionIs(filePath, instance.compiler.Extension.Dts)) {
    return [];
  }
  if (isReferencedFile(instance, filePath)) {
    return instance.solutionBuilderHost!.getOutputFilesFromReferencedProjectInput(
      filePath
    );
  }
  const program = ensureProgram(instance);
  if (program !== undefined) {
    const sourceFile = program.getSourceFile(filePath);
    const outputFiles: typescript.OutputFile[] = [];
    const writeFile = (
      fileName: string,
      text: string,
      writeByteOrderMark: boolean
    ) => outputFiles.push({ name: fileName, writeByteOrderMark, text });
    const outputFilesFromWatch = getEmitFromWatchHost(instance, filePath);
    if (outputFilesFromWatch) {
      return outputFilesFromWatch;
    }
    program.emit(
      sourceFile,
      writeFile,
      /*cancellationToken*/ undefined,
      /*emitOnlyDtsFiles*/ false,
      instance.transformers
    );
    return outputFiles;
  } else {
    // Emit Javascript
    return instance.languageService!.getProgram()!.getSourceFile(filePath) ===
      undefined
      ? []
      : instance.languageService!.getEmitOutput(filePath).outputFiles;
  }
}
