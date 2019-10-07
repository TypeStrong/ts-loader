import chalk, { Chalk } from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as typescript from 'typescript';
import * as webpack from 'webpack';

import { makeAfterCompile } from './after-compile';
import { getCompiler, getCompilerOptions } from './compilerSetup';
import { getConfigFile, getConfigParseResult } from './config';
import { dtsDtsxOrDtsDtsxMapRegex, EOL, tsTsxRegex } from './constants';
import {
  LoaderOptions,
  TSFile,
  TSFiles,
  TSInstance,
  TSInstances,
  WebpackError
} from './interfaces';
import * as logger from './logger';
import {
  getSolutionErrors,
  makeServicesHost,
  makeSolutionBuilderHost,
  makeWatchHost
} from './servicesHost';
import {
  appendSuffixesIfMatch,
  ensureProgram,
  formatErrors,
  isUsingProjectReferences,
  makeError,
  supportsSolutionBuild
} from './utils';
import { makeWatchRun } from './watch-run';

const instances = {} as TSInstances;

/**
 * The loader is executed once for each file seen by webpack. However, we need to keep
 * a persistent instance of TypeScript that contains all of the files in the program
 * along with definition files and options. This function either creates an instance
 * or returns the existing one. Multiple instances are possible by using the
 * `instance` property.
 */
export function getTypeScriptInstance(
  loaderOptions: LoaderOptions,
  loader: webpack.loader.LoaderContext
): { instance?: TSInstance; error?: WebpackError } {
  if (instances.hasOwnProperty(loaderOptions.instance)) {
    const instance = instances[loaderOptions.instance];
    ensureProgram(instance);
    return { instance: instances[loaderOptions.instance] };
  }

  const colors = new chalk.constructor({ enabled: loaderOptions.colors });
  const log = logger.makeLogger(loaderOptions, colors);
  const compiler = getCompiler(loaderOptions, log);

  if (compiler.errorMessage !== undefined) {
    return { error: makeError(colors.red(compiler.errorMessage), undefined) };
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

function successfulTypeScriptInstance(
  loaderOptions: LoaderOptions,
  loader: webpack.loader.LoaderContext,
  log: logger.Logger,
  colors: Chalk,
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
        colors.red('error while reading tsconfig.json:' + EOL + message),
        file
      )
    };
  }

  const { configFilePath, configFile } = configFileAndPath;
  const basePath = loaderOptions.context || path.dirname(configFilePath || '');
  const configParseResult = getConfigParseResult(
    compiler,
    configFile,
    basePath,
    configFilePath,
    loaderOptions.projectReferences
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

    loader._module.errors.push(...errors);

    return {
      error: makeError(
        colors.red('error while parsing tsconfig.json'),
        configFilePath
      )
    };
  }

  const compilerOptions = getCompilerOptions(configParseResult);
  const rootFileNames = new Set<string>();
  const files: TSFiles = new Map<string, TSFile>();
  const otherFiles: TSFiles = new Map<string, TSFile>();

  const appendTsTsxSuffixesIfRequired =
    loaderOptions.appendTsSuffixTo.length > 0 ||
    loaderOptions.appendTsxSuffixTo.length > 0
      ? (filePath: string) =>
          appendSuffixesIfMatch(
            {
              '.ts': loaderOptions.appendTsSuffixTo,
              '.tsx': loaderOptions.appendTsxSuffixTo
            },
            filePath
          )
      : (filePath: string) => filePath;

  // same strategy as https://github.com/s-panferov/awesome-typescript-loader/pull/531/files
  let { getCustomTransformers: customerTransformers } = loaderOptions;
  let getCustomTransformers = Function.prototype;

  if (typeof customerTransformers === 'function') {
    getCustomTransformers = customerTransformers;
  } else if (typeof customerTransformers === 'string') {
    try {
      customerTransformers = require(customerTransformers);
    } catch (err) {
      throw new Error(
        `Failed to load customTransformers from "${
          loaderOptions.getCustomTransformers
        }": ${err.message}`
      );
    }

    if (typeof customerTransformers !== 'function') {
      throw new Error(
        `Custom transformers in "${
          loaderOptions.getCustomTransformers
        }" should export a function, got ${typeof getCustomTransformers}`
      );
    }
    getCustomTransformers = customerTransformers;
  }

  // if allowJs is set then we should accept js(x) files
  const scriptRegex =
    configParseResult.options.allowJs === true
      ? /\.tsx?$|\.jsx?$/i
      : /\.tsx?$/i;

  if (loaderOptions.transpileOnly) {
    // quick return for transpiling
    // we do need to check for any issues with TS options though
    const transpileInstance: TSInstance = (instances[loaderOptions.instance] = {
      compiler,
      compilerOptions,
      appendTsTsxSuffixesIfRequired,
      loaderOptions,
      rootFileNames,
      files,
      otherFiles,
      program: undefined, // temporary, to be set later
      dependencyGraph: {},
      reverseDependencyGraph: {},
      transformers: {} as typescript.CustomTransformers, // this is only set temporarily, custom transformers are created further down
      colors
    });

    tryAndBuildSolutionReferences(
      transpileInstance,
      loader,
      log,
      scriptRegex,
      configFilePath
    );
    const program = (transpileInstance.program =
      configParseResult.projectReferences !== undefined
        ? compiler!.createProgram({
            rootNames: configParseResult.fileNames,
            options: configParseResult.options,
            projectReferences: configParseResult.projectReferences
          })
        : compiler!.createProgram([], compilerOptions));

    // happypack does not have _module.errors - see https://github.com/TypeStrong/ts-loader/issues/336
    if (!loaderOptions.happyPackMode) {
      const solutionErrors: WebpackError[] = getSolutionErrors(
        transpileInstance,
        loader.context
      );
      const diagnostics = program.getOptionsDiagnostics();
      const errors = formatErrors(
        diagnostics,
        loaderOptions,
        colors,
        compiler!,
        { file: configFilePath || 'tsconfig.json' },
        loader.context
      );
      loader._module.errors.push(...solutionErrors, ...errors);
    }
    transpileInstance.transformers = getCustomTransformers(program);
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
      files.set(normalizedFilePath, {
        text: fs.readFileSync(normalizedFilePath, 'utf-8'),
        version: 0
      });
      rootFileNames.add(normalizedFilePath);
    });
  } catch (exc) {
    return {
      error: makeError(
        colors.red(
          `A file specified in tsconfig.json could not be found: ${normalizedFilePath!}`
        ),
        normalizedFilePath!
      )
    };
  }

  const instance: TSInstance = (instances[loaderOptions.instance] = {
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
    dependencyGraph: {},
    reverseDependencyGraph: {},
    colors
  });

  if (!loader._compiler.hooks) {
    throw new Error(
      "You may be using an old version of webpack; please check you're using at least version 4"
    );
  }

  tryAndBuildSolutionReferences(
    instance,
    loader,
    log,
    scriptRegex,
    configFilePath
  );

  if (loaderOptions.experimentalWatchApi && compiler.createWatchProgram) {
    log.logInfo('Using watch api');

    // If there is api available for watch, use it instead of language service
    instance.watchHost = makeWatchHost(
      scriptRegex,
      log,
      loader,
      instance,
      configParseResult.projectReferences
    );
    instance.watchOfFilesAndCompilerOptions = compiler.createWatchProgram(
      instance.watchHost
    );
    instance.builderProgram = instance.watchOfFilesAndCompilerOptions.getProgram();
    instance.program = instance.builderProgram.getProgram();

    instance.transformers = getCustomTransformers(instance.program);
  } else {
    const servicesHost = makeServicesHost(
      scriptRegex,
      log,
      loader,
      instance,
      loaderOptions.experimentalFileCaching,
      configParseResult.projectReferences
    );

    instance.languageService = compiler.createLanguageService(
      servicesHost.servicesHost,
      compiler.createDocumentRegistry()
    );

    if (servicesHost.clearCache !== null) {
      loader._compiler.hooks.watchRun.tap('ts-loader', servicesHost.clearCache);
    }

    instance.transformers = getCustomTransformers(
      instance.languageService!.getProgram()
    );
  }

  loader._compiler.hooks.afterCompile.tapAsync(
    'ts-loader',
    makeAfterCompile(instance, configFilePath)
  );
  loader._compiler.hooks.watchRun.tapAsync('ts-loader', makeWatchRun(instance));

  return { instance };
}

function tryAndBuildSolutionReferences(
  instance: TSInstance,
  loader: webpack.loader.LoaderContext,
  log: logger.Logger,
  scriptRegex: RegExp,
  configFilePath: string | undefined
) {
  if (
    configFilePath &&
    supportsSolutionBuild(instance.loaderOptions, instance.compiler)
  ) {
    // Use solution builder
    log.logInfo('Using SolutionBuilder api');
    instance.configFilePath = configFilePath;
    instance.solutionBuilderHost = makeSolutionBuilderHost(
      scriptRegex,
      log,
      loader,
      instance
    );
    instance.solutionBuilder = instance.compiler.createSolutionBuilderWithWatch(
      instance.solutionBuilderHost,
      [configFilePath],
      { verbose: true }
    );
    instance.solutionBuilder.buildReferences(instance.configFilePath);
    for (const [fileName] of instance.solutionBuilderHost.watchedFiles) {
      instance.otherFiles.set(path.resolve(fileName), {
        version: 0,
        text: instance.solutionBuilderHost.readFile(fileName)
      });
      if (instance.loaderOptions.transpileOnly) {
        loader.addDependency(fileName);
      }
    }
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

function getOutputFileNames(
  instance: TSInstance,
  configFile: typescript.ParsedCommandLine,
  inputFileName: string
): string[] {
  const ignoreCase = !instance.compiler.sys.useCaseSensitiveFileNames;
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

function getOutputFilesFromReference(
  program: typescript.Program,
  instance: TSInstance,
  filePath: string,
  skipActualOutputRead: boolean
): typescript.OutputFile[] | undefined {
  // May be api to get file
  return forEachResolvedProjectReference(
    program.getResolvedProjectReferences(),
    ({ commandLine }) => {
      const { options, fileNames } = commandLine;
      if (
        !options.outFile &&
        !options.out &&
        fileNames.some(file => path.normalize(file) === filePath)
      ) {
        const outputFiles: typescript.OutputFile[] = [];
        if (!skipActualOutputRead) {
          getOutputFileNames(
            instance,
            commandLine,
            (instance.compiler as any).resolvePath(filePath)
          ).forEach(name => {
            const output = instance.solutionBuilderHost!.outputFiles.get(
              path.resolve(name)
            );
            if (output) {
              outputFiles.push(output);
            } else {
              const text = instance.compiler.sys.readFile(name);
              if (text) {
                outputFiles.push({ name, text, writeByteOrderMark: false });
              }
            }
          });
        }
        return outputFiles;
      }
      return undefined;
    }
  );
}

export function getInputFileNameFromOutput(
  instance: TSInstance,
  filePath: string
): string | undefined {
  if (filePath.match(tsTsxRegex) && !fileExtensionIs(filePath, '.d.ts')) {
    return undefined;
  }
  const program = ensureProgram(instance);
  return (
    program &&
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

export function isReferencedFile(instance: TSInstance, filePath: string) {
  return (
    !!instance.solutionBuilderHost &&
    !!instance.solutionBuilderHost.watchedFiles.get(filePath)
  );
}

export function getEmitFromWatchHost(instance: TSInstance, filePath?: string) {
  const program = ensureProgram(instance);
  const builderProgram = instance.builderProgram;
  if (builderProgram && program) {
    if (filePath) {
      const existing = instance.watchHost!.outputFiles.get(filePath);
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
          text
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
      if ((result.affected as typescript.SourceFile).fileName) {
        instance.watchHost!.outputFiles.set(
          path.resolve((result.affected as typescript.SourceFile).fileName),
          outputFiles.slice()
        );
      }
      if (result.affected === sourceFile) {
        return outputFiles;
      }
    }
  }
  return undefined;
}

export function getEmitOutput(
  instance: TSInstance,
  filePath: string,
  skipActualOutputReadOfReferencedFile: boolean
) {
  if (fileExtensionIs(filePath, instance.compiler.Extension.Dts)) {
    return [];
  }
  const program = ensureProgram(instance);
  if (program !== undefined) {
    const sourceFile = program.getSourceFile(filePath);
    if (isReferencedFile(instance, filePath)) {
      const builtReferences = getOutputFilesFromReference(
        program,
        instance,
        filePath,
        skipActualOutputReadOfReferencedFile
      );
      if (builtReferences) {
        return builtReferences;
      }
    }
    const outputFiles: typescript.OutputFile[] = [];
    const writeFile = (
      fileName: string,
      text: string,
      writeByteOrderMark: boolean
    ) => outputFiles.push({ name: fileName, writeByteOrderMark, text });
    // The source file will be undefined if it’s part of an unbuilt project reference
    if (sourceFile !== undefined || !isUsingProjectReferences(instance)) {
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
    }
    return outputFiles;
  } else {
    // Emit Javascript
    return instance.languageService!.getProgram()!.getSourceFile(filePath) ===
      undefined
      ? []
      : instance.languageService!.getEmitOutput(filePath).outputFiles;
  }
}
