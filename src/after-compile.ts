import * as path from 'path';
import type * as ts from 'typescript';
import * as webpack from 'webpack';

import * as constants from './constants';
import { getEmitFromWatchHost, getEmitOutput } from './instances';
import {
  FilePathKey,
  LoaderOptions,
  TSFiles,
  TSInstance,
  TSFile,
} from './interfaces';
import {
  collectAllDependants,
  ensureProgram,
  formatErrors,
  isReferencedFile,
  populateReverseDependencyGraph,
  tsLoaderSource,
} from './utils';

/**
 * This returns a function that has options to add assets and also to provide errors to webpack
 * In webpack 4 we can do both during the afterCompile hook
 * In webpack 5 only errors should be provided during aftercompile.  Assets should be
 * emitted during the afterProcessAssets hook
 */
export function makeAfterCompile(
  instance: TSInstance,
  configFilePath: string | undefined
) {
  let getCompilerOptionDiagnostics = true;
  let checkAllFilesForErrors = true;

  return (compilation: webpack.Compilation, callback: () => void) => {
    // Don't add errors for child compilations
    if (compilation.compiler.isChild()) {
      callback();
      return;
    }

    if (instance.loaderOptions.transpileOnly) {
      provideAssetsFromSolutionBuilderHost(instance, compilation);
      callback();
      return;
    }
    removeCompilationTSLoaderErrors(compilation, instance.loaderOptions);

    provideCompilerOptionDiagnosticErrorsToWebpack(
      getCompilerOptionDiagnostics,
      compilation,
      instance,
      configFilePath
    );
    getCompilerOptionDiagnostics = false;

    const modules = determineModules(compilation, instance);

    const filesToCheckForErrors = determineFilesToCheckForErrors(
      checkAllFilesForErrors,
      instance
    );
    checkAllFilesForErrors = false;

    const filesWithErrors: TSFiles = new Map();
    provideErrorsToWebpack(
      filesToCheckForErrors,
      filesWithErrors,
      compilation,
      modules,
      instance
    );
    provideSolutionErrorsToWebpack(compilation, modules, instance);
    provideDeclarationFilesToWebpack(
      filesToCheckForErrors,
      instance,
      compilation
    );
    provideTsBuildInfoFilesToWebpack(instance, compilation);
    provideAssetsFromSolutionBuilderHost(instance, compilation);

    instance.filesWithErrors = filesWithErrors;
    instance.modifiedFiles = undefined;
    instance.projectsMissingSourceMaps = new Set();
    callback();
  };
}

/**
 * handle compiler option errors after the first compile
 */
function provideCompilerOptionDiagnosticErrorsToWebpack(
  getCompilerOptionDiagnostics: boolean,
  compilation: webpack.Compilation,
  instance: TSInstance,
  configFilePath: string | undefined
) {
  if (getCompilerOptionDiagnostics) {
    const { languageService, loaderOptions, compiler, program } = instance;
    const errors = formatErrors(
      program === undefined
        ? languageService!.getCompilerOptionsDiagnostics()
        : program.getOptionsDiagnostics(),
      loaderOptions,
      instance.colors,
      compiler,
      { file: configFilePath || 'tsconfig.json' },
      compilation.compiler.context
    );

    compilation.errors.push(...errors);
  }
}

/**
 * build map of all modules based on normalized filename
 * this is used for quick-lookup when trying to find modules
 * based on filepath
 */
function determineModules(
  compilation: webpack.Compilation,
  { filePathKeyMapper }: TSInstance
) {
  const modules: Map<FilePathKey, webpack.Module[]> = new Map();

  compilation.modules.forEach(module => {
    if (module instanceof webpack.NormalModule && module.resource) {
      const modulePath = filePathKeyMapper(module.resource);
      const existingModules = modules.get(modulePath);
      if (existingModules !== undefined) {
        if (!existingModules.includes(module)) {
          existingModules.push(module);
        }
      } else {
        modules.set(modulePath, [module]);
      }
    }
  });

  return modules;
}

function determineFilesToCheckForErrors(
  checkAllFilesForErrors: boolean,
  instance: TSInstance
) {
  const { files, modifiedFiles, filesWithErrors, otherFiles } = instance;
  // calculate array of files to check
  const filesToCheckForErrors: TSFiles = new Map();
  if (checkAllFilesForErrors) {
    // check all files on initial run
    for (const [filePath, file] of files) {
      addFileToCheckForErrors(filePath, file);
    }
    for (const [filePath, file] of otherFiles) {
      addFileToCheckForErrors(filePath, file);
    }
  } else if (
    modifiedFiles !== null &&
    modifiedFiles !== undefined &&
    modifiedFiles.size
  ) {
    const reverseDependencyGraph = populateReverseDependencyGraph(instance);
    // check all modified files, and all dependants
    for (const modifiedFileName of modifiedFiles.keys()) {
      for (const fileName of collectAllDependants(
        reverseDependencyGraph,
        modifiedFileName
      ).keys()) {
        const fileToCheckForErrors =
          files.get(fileName) || otherFiles.get(fileName);
        if (fileToCheckForErrors) {//file may have been removed
          addFileToCheckForErrors(fileName, fileToCheckForErrors);
        }
      }
    }
  }

  // re-check files with errors from previous build
  if (filesWithErrors !== undefined) {
    for (const [fileWithErrorName, fileWithErrors] of filesWithErrors) {
      addFileToCheckForErrors(fileWithErrorName, fileWithErrors);
    }
  }
  return filesToCheckForErrors;

  function addFileToCheckForErrors(filePath: FilePathKey, file: TSFile) {
    if (file && !isReferencedFile(instance, filePath)) {
      filesToCheckForErrors.set(filePath, file);
    }
  }
}

function provideErrorsToWebpack(
  filesToCheckForErrors: TSFiles,
  filesWithErrors: TSFiles,
  compilation: webpack.Compilation,
  modules: Map<FilePathKey, webpack.Module[]>,
  instance: TSInstance
) {
  const {
    compiler,
    files,
    loaderOptions,
    compilerOptions,
    otherFiles,
  } = instance;

  const filePathRegex =
    compilerOptions.allowJs === true
      ? constants.dtsTsTsxJsJsxRegex
      : constants.dtsTsTsxRegex;

  // I’m pretty sure this will never be undefined here
  const program = ensureProgram(instance);
  for (const [filePath, { fileName }] of filesToCheckForErrors.entries()) {
    if (fileName.match(filePathRegex) === null) {
      continue;
    }

    const sourceFile = program && program.getSourceFile(fileName);
    const errors: ts.Diagnostic[] = [];
    if (program && sourceFile) {
      errors.push(
        ...program!.getSyntacticDiagnostics(sourceFile),
        ...program!
          .getSemanticDiagnostics(sourceFile)
          // Output file has not been built from source file - this message is redundant with
          // program.getOptionsDiagnostics() separately added in instances.ts
          .filter(({ code }) => code !== 6305)
      );
    }
    if (errors.length > 0) {
      const fileWithError = files.get(filePath) || otherFiles.get(filePath);
      filesWithErrors.set(filePath, fileWithError!);
    }

    // if we have access to a webpack module, use that
    const associatedModules = modules.get(instance.filePathKeyMapper(fileName));
    if (associatedModules !== undefined) {
      associatedModules.forEach(module => {
        removeModuleTSLoaderError(module, loaderOptions);

        // append errors
        const formattedErrors = formatErrors(
          errors,
          loaderOptions,
          instance.colors,
          compiler,
          { module },
          compilation.compiler.context
        );

        formattedErrors.forEach(error => {
          if (module.addError) {
            module.addError(error);
          } else {
            module.errors.push(error);
          }
        });

        compilation.errors.push(...formattedErrors);
      });
    } else {
      // otherwise it's a more generic error
      const formattedErrors = formatErrors(
        errors,
        loaderOptions,
        instance.colors,
        compiler,
        { file: fileName },
        compilation.compiler.context
      );

      compilation.errors.push(...formattedErrors);
    }
  }
}

function provideSolutionErrorsToWebpack(
  compilation: webpack.Compilation,
  modules: Map<FilePathKey, webpack.Module[]>,
  instance: TSInstance
) {
  if (
    !instance.solutionBuilderHost ||
    !(
      instance.solutionBuilderHost.diagnostics.global.length ||
      instance.solutionBuilderHost.diagnostics.perFile.size
    )
  ) {
    return;
  }

  const {
    compiler,
    loaderOptions,
    solutionBuilderHost: { diagnostics },
  } = instance;

  for (const [filePath, perFileDiagnostics] of diagnostics.perFile) {
    // if we have access to a webpack module, use that
    const associatedModules = modules.get(filePath);
    if (associatedModules !== undefined) {
      associatedModules.forEach(module => {
        removeModuleTSLoaderError(module, loaderOptions);

        // append errors
        const formattedErrors = formatErrors(
          perFileDiagnostics,
          loaderOptions,
          instance.colors,
          compiler,
          { module },
          compilation.compiler.context
        );

        formattedErrors.forEach(error => {
          if (module.addError) {
            module.addError(error);
          } else {
            module.errors.push(error);
          }
        });

        compilation.errors.push(...formattedErrors);
      });
    } else {
      // otherwise it's a more generic error
      const formattedErrors = formatErrors(
        perFileDiagnostics,
        loaderOptions,
        instance.colors,
        compiler,
        { file: path.resolve(perFileDiagnostics[0].file!.fileName) },
        compilation.compiler.context
      );

      compilation.errors.push(...formattedErrors);
    }
  }

  // Add global solution errors
  compilation.errors.push(
    ...formatErrors(
      diagnostics.global,
      instance.loaderOptions,
      instance.colors,
      instance.compiler,
      { file: 'tsconfig.json' },
      compilation.compiler.context
    )
  );
}

/**
 * gather all declaration files from TypeScript and output them to webpack
 */
function provideDeclarationFilesToWebpack(
  filesToCheckForErrors: TSFiles,
  instance: TSInstance,
  compilation: webpack.Compilation
) {
  for (const { fileName } of filesToCheckForErrors.values()) {
    if (fileName.match(constants.tsTsxRegex) === null) {
      continue;
    }

    addDeclarationFilesAsAsset(getEmitOutput(instance, fileName), compilation);
  }
}

function addDeclarationFilesAsAsset<T extends ts.OutputFile>(
  outputFiles: T[] | IterableIterator<T>,
  compilation: webpack.Compilation,
  skipOutputFile?: (outputFile: T) => boolean
) {
  outputFilesToAsset(outputFiles, compilation, outputFile =>
    skipOutputFile && skipOutputFile(outputFile)
      ? true
      : !outputFile.name.match(constants.dtsDtsxOrDtsDtsxMapRegex)
  );
}

function outputFileToAsset(
  outputFile: ts.OutputFile,
  compilation: webpack.Compilation
) {
  const assetPath = path
    .relative(compilation.compiler.outputPath, outputFile.name)
    // According to @alexander-akait (and @sokra) we should always '/' https://github.com/TypeStrong/ts-loader/pull/1251#issuecomment-799606985
    .replace(/\\/g, '/');

  // As suggested by @JonWallsten here: https://github.com/TypeStrong/ts-loader/pull/1251#issuecomment-800032753
  compilation.emitAsset(
    assetPath,
    new webpack.sources.RawSource(outputFile.text)
  );
}

function outputFilesToAsset<T extends ts.OutputFile>(
  outputFiles: T[] | IterableIterator<T>,
  compilation: webpack.Compilation,
  skipOutputFile?: (outputFile: T) => boolean
) {
  for (const outputFile of outputFiles) {
    if (!skipOutputFile || !skipOutputFile(outputFile)) {
      outputFileToAsset(outputFile, compilation);
    }
  }
}

/**
 * gather all .tsbuildinfo for the project
 */
function provideTsBuildInfoFilesToWebpack(
  instance: TSInstance,
  compilation: webpack.Compilation
) {
  if (instance.watchHost) {
    // Ensure emit is complete
    getEmitFromWatchHost(instance);
    if (instance.watchHost.tsbuildinfo) {
      outputFileToAsset(instance.watchHost.tsbuildinfo, compilation);
    }

    instance.watchHost.outputFiles.clear();
    instance.watchHost.tsbuildinfo = undefined;
  }
}

/**
 * gather all solution builder assets
 */
function provideAssetsFromSolutionBuilderHost(
  instance: TSInstance,
  compilation: webpack.Compilation
) {
  if (instance.solutionBuilderHost) {
    // written files
    outputFilesToAsset(instance.solutionBuilderHost.writtenFiles, compilation);
    instance.solutionBuilderHost.writtenFiles.length = 0;
  }
}

/**
 * handle all other errors. The basic approach here to get accurate error
 * reporting is to start with a "blank slate" each compilation and gather
 * all errors from all files. Since webpack tracks errors in a module from
 * compilation-to-compilation, and since not every module always runs through
 * the loader, we need to detect and remove any pre-existing errors.
 */
function removeCompilationTSLoaderErrors(
  compilation: webpack.Compilation,
  loaderOptions: LoaderOptions
) {
  compilation.errors = compilation.errors.filter(
    error => error.details !== tsLoaderSource(loaderOptions)
  );
}

function removeModuleTSLoaderError(
  module: webpack.Module,
  loaderOptions: LoaderOptions
) {
  const warnings = module.getWarnings();
  const errors = module.getErrors();
  module.clearWarningsAndErrors();

  Array.from(warnings || []).forEach(warning => module.addWarning(warning));
  Array.from(errors || [])
    .filter(
      (error: any) => error.loaderSource !== tsLoaderSource(loaderOptions)
    )
    .forEach(error => module.addError(error));
}
