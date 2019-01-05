import chalk, { Chalk } from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as typescript from 'typescript';

import { makeAfterCompile } from './after-compile';
import { getCompiler, getCompilerOptions } from './compilerSetup';
import { getConfigFile, getConfigParseResult } from './config';
import { dtsDtsxOrDtsDtsxMapRegex, EOL } from './constants';
import {
  LoaderOptions,
  TSFile,
  TSFiles,
  TSInstance,
  TSInstances,
  Webpack,
  WebpackError
} from './interfaces';
import * as logger from './logger';
import { makeServicesHost, makeWatchHost } from './servicesHost';
import {
  ensureProgram,
  formatErrors,
  isUsingProjectReferences,
  makeError
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
    const program =
      configParseResult.projectReferences !== undefined
        ? compiler!.createProgram({
            rootNames: configParseResult.fileNames,
            options: configParseResult.options,
            projectReferences: configParseResult.projectReferences
          })
        : compiler!.createProgram([], compilerOptions);

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

    instances[loaderOptions.instance] = {
      compiler,
      compilerOptions,
      loaderOptions,
      files,
      otherFiles,
      program,
      dependencyGraph: {},
      reverseDependencyGraph: {},
      transformers: getCustomTransformers(program),
      colors
    };

    return { instance: instances[loaderOptions.instance] };
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
  const scriptRegex =
    configParseResult.options.allowJs === true
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
    transformers: {} as typescript.CustomTransformers, // this is only set temporarily, custom transformers are created further down
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
      loaderOptions.appendTsxSuffixTo,
      configParseResult.projectReferences
    );
    instance.watchOfFilesAndCompilerOptions = compiler.createWatchProgram(
      instance.watchHost
    );
    instance.program = instance.watchOfFilesAndCompilerOptions
      .getProgram()
      .getProgram();

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

    instance.transformers = getCustomTransformers(instance.languageService!.getProgram());
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
  if (program !== undefined) {
    const outputFiles: typescript.OutputFile[] = [];
    const writeFile = (
      fileName: string,
      text: string,
      writeByteOrderMark: boolean
    ) => outputFiles.push({ name: fileName, writeByteOrderMark, text });
    const sourceFile = program.getSourceFile(filePath);
    // The source file will be undefined if it’s part of an unbuilt project reference
    if (sourceFile !== undefined || !isUsingProjectReferences(instance)) {
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
