import * as path from 'path';
import * as ts from 'typescript';
import * as webpack from 'webpack';

import * as constants from './constants';
import { getEmitFromWatchHost, getEmitOutput } from './instances';
import {
  FilePathKey,
  TSFiles,
  TSInstance,
  WebpackModule,
  TSFile,
} from './interfaces';
import {
  collectAllDependants,
  ensureProgram,
  formatErrors,
  isReferencedFile,
  populateReverseDependencyGraph,
} from './utils';

export function makeAfterCompile(
  instance: TSInstance,
  configFilePath: string | undefined
) {
  let getCompilerOptionDiagnostics = true;
  let checkAllFilesForErrors = true;

  return (
    compilation: webpack.compilation.Compilation,
    callback: () => void
  ) => {
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
    provideDeclarationFilesToWebpack(
      filesToCheckForErrors,
      instance,
      compilation
    );
    provideTsBuildInfoFilesToWebpack(instance, compilation);

    provideSolutionErrorsToWebpack(compilation, modules, instance);
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
  compilation: webpack.compilation.Compilation,
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
  compilation: webpack.compilation.Compilation,
  { filePathKeyMapper }: TSInstance
) {
  const modules: Map<FilePathKey, WebpackModule[]> = new Map();

  compilation.modules.forEach(module => {
    if (module.resource) {
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
        addFileToCheckForErrors(fileName, fileToCheckForErrors!);
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
    if (!isReferencedFile(instance, filePath)) {
      filesToCheckForErrors.set(filePath, file);
    }
  }
}

function provideErrorsToWebpack(
  filesToCheckForErrors: TSFiles,
  filesWithErrors: TSFiles,
  compilation: webpack.compilation.Compilation,
  modules: Map<FilePathKey, WebpackModule[]>,
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
            module.addError(new Error(error.message));
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
  compilation: webpack.compilation.Compilation,
  modules: Map<FilePathKey, WebpackModule[]>,
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
            module.addError(new Error(error.message));
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
  compilation: webpack.compilation.Compilation
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
  compilation: webpack.compilation.Compilation,
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
  compilation: webpack.compilation.Compilation
) {
  const assetPath = path.relative(
    compilation.compiler.outputPath,
    outputFile.name
  );
  compilation.assets[assetPath] = {
    source: () => outputFile.text,
    size: () => outputFile.text.length,
  };
}

function outputFilesToAsset<T extends ts.OutputFile>(
  outputFiles: T[] | IterableIterator<T>,
  compilation: webpack.compilation.Compilation,
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
  compilation: webpack.compilation.Compilation
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
  compilation: webpack.compilation.Compilation
) {
  if (instance.solutionBuilderHost) {
    // written files
    outputFilesToAsset(instance.solutionBuilderHost.writtenFiles, compilation);
    instance.solutionBuilderHost.writtenFiles.length = 0;
  }
}
