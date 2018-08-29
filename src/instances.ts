import * as typescript from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import chalk, { Chalk } from 'chalk';

import { makeAfterCompile } from './after-compile';
import { getConfigFile, getConfigParseResult } from './config';
import { EOL, dtsDtsxOrDtsDtsxMapRegex } from './constants';
import { getCompilerOptions, getCompiler } from './compilerSetup';
import { makeError, formatErrors } from './utils';
import * as logger from './logger';
import { makeServicesHost, makeWatchHost } from './servicesHost';
import { makeWatchRun } from './watch-run';
import {
  LoaderOptions,
  TSFiles,
  TSInstance,
  TSInstances,
  Webpack,
  WebpackError,
  TSFile
} from './interfaces';

const instances = <TSInstances>{};

function ensureProgram(instance: TSInstance) {
  if (instance && instance.watchHost) {
    if (instance.hasUnaccountedModifiedFiles) {
      if (instance.changedFilesList) {
        instance.watchHost.updateRootFileNames();
      }
      if (instance.watchOfFilesAndCompilerOptions) {
        instance.program = instance.watchOfFilesAndCompilerOptions
          .getProgram()
          .getProgram();
      }
      instance.hasUnaccountedModifiedFiles = false;
    }
    return instance.program;
  }
  return undefined;
}
/**
 * The loader is executed once for each file seen by webpack. However, we need to keep
 * a persistent instance of TypeScript that contains all of the files in the program
 * along with definition files and options. This function either creates an instance
 * or returns the existing one. Multiple instances are possible by using the
 * `instance` property.
 */
export function getTypeScriptInstance(
  loaderOptions: LoaderOptions,
  loader: Webpack
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
  loader: Webpack,
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
    basePath
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
  const files: TSFiles = new Map<string, TSFile>();
  const otherFiles: TSFiles = new Map<string, TSFile>();

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

  if (loaderOptions.transpileOnly) {
    // quick return for transpiling
    // we do need to check for any issues with TS options though
    const program = compiler!.createProgram([], compilerOptions);

    // happypack does not have _module.errors - see https://github.com/TypeStrong/ts-loader/issues/336
    if (!loaderOptions.happyPackMode) {
      const diagnostics = program.getOptionsDiagnostics();
      const errors = formatErrors(
        diagnostics,
        loaderOptions,
        colors,
        compiler!,
        { file: configFilePath || 'tsconfig.json' },
        loader.context
      );

      loader._module.errors.push(...errors);
    }

    const instance: TSInstance = {
      compiler,
      compilerOptions,
      loaderOptions,
      files,
      otherFiles,
      dependencyGraph: {},
      reverseDependencyGraph: {},
      transformers: getCustomTransformers(),
      colors
    };

    instances[loaderOptions.instance] = instance;

    return { instance };
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

  // if allowJs is set then we should accept js(x) files
  const scriptRegex = configParseResult.options.allowJs
    ? /\.tsx?$|\.jsx?$/i
    : /\.tsx?$/i;

  const instance: TSInstance = (instances[loaderOptions.instance] = {
    compiler,
    compilerOptions,
    loaderOptions,
    files,
    otherFiles,
    languageService: null,
    version: 0,
    transformers: getCustomTransformers(),
    dependencyGraph: {},
    reverseDependencyGraph: {},
    modifiedFiles: null,
    colors
  });

  if (!loader._compiler.hooks) {
    throw new Error(
      "You may be using an old version of webpack; please check you're using at least version 4"
    );
  }

  if (loaderOptions.experimentalWatchApi && compiler.createWatchProgram) {
    log.logInfo('Using watch api');

    // If there is api available for watch, use it instead of language service
    instance.watchHost = makeWatchHost(
      scriptRegex,
      log,
      loader,
      instance,
      loaderOptions.appendTsSuffixTo,
      loaderOptions.appendTsxSuffixTo
    );
    instance.watchOfFilesAndCompilerOptions = compiler.createWatchProgram(
      instance.watchHost
    );
    instance.program = instance.watchOfFilesAndCompilerOptions
      .getProgram()
      .getProgram();
  } else {
    const cachedServicesHost = makeServicesHost(
      scriptRegex,
      log,
      loader,
      instance,
      loaderOptions.experimentalFileCaching
    );

    instance.languageService = compiler.createLanguageService(
      cachedServicesHost.servicesHost,
      compiler.createDocumentRegistry()
    );

    if (cachedServicesHost.clearCache !== null) {
      loader._compiler.hooks.watchRun.tap(
        'ts-loader',
        cachedServicesHost.clearCache
      );
    }
  }

  loader._compiler.hooks.afterCompile.tapAsync(
    'ts-loader',
    makeAfterCompile(instance, configFilePath)
  );
  loader._compiler.hooks.watchRun.tapAsync('ts-loader', makeWatchRun(instance));

  return { instance };
}

export function getEmitOutput(instance: TSInstance, filePath: string) {
  const program = ensureProgram(instance);
  if (program) {
    const outputFiles: typescript.OutputFile[] = [];
    const writeFile = (
      fileName: string,
      text: string,
      writeByteOrderMark: boolean
    ) => outputFiles.push({ name: fileName, writeByteOrderMark, text });
    const sourceFile = program.getSourceFile(filePath);
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
    return instance.languageService!.getEmitOutput(filePath).outputFiles;
  }
}
