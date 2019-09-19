import * as path from 'path';
import * as ts from 'typescript';
import * as webpack from 'webpack';

import * as constants from './constants';
import { forEachResolvedProjectReference, getEmitOutput } from './instances';
import {
  TSFile,
  TSFiles,
  TSInstance,
  WebpackError,
  WebpackModule
} from './interfaces';
import {
  collectAllDependants,
  ensureProgram,
  formatErrors,
  isUsingProjectReferences
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

    removeTSLoaderErrors(compilation.errors);

    provideCompilerOptionDiagnosticErrorsToWebpack(
      getCompilerOptionDiagnostics,
      compilation,
      instance,
      configFilePath
    );
    getCompilerOptionDiagnostics = false;

    const modules = determineModules(compilation);

    const filesToCheckForErrors = determineFilesToCheckForErrors(
      checkAllFilesForErrors,
      instance
    );
    checkAllFilesForErrors = false;

    const filesWithErrors: TSFiles = new Map<string, TSFile>();
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

    provideSolutionErrorsToWebpack(compilation, modules, instance);
    provideTsBuildInfoFilesToWebpack(instance, compilation);

    instance.filesWithErrors = filesWithErrors;
    instance.modifiedFiles = null;
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

    const errorsToAdd = formatErrors(
      program === undefined
        ? languageService!.getCompilerOptionsDiagnostics()
        : program.getOptionsDiagnostics(),
      loaderOptions,
      instance.colors,
      compiler,
      { file: configFilePath || 'tsconfig.json' },
      compilation.compiler.context
    );

    compilation.errors.push(...errorsToAdd);
  }
}

/**
 * build map of all modules based on normalized filename
 * this is used for quick-lookup when trying to find modules
 * based on filepath
 */
function determineModules(compilation: webpack.compilation.Compilation) {
  return compilation.modules.reduce<Map<string, WebpackModule[]>>(
    (modules, module) => {
      if (module.resource) {
        const modulePath = path.normalize(module.resource);
        const existingModules = modules.get(modulePath);
        if (existingModules !== undefined) {
          if (existingModules.indexOf(module) === -1) {
            existingModules.push(module);
          }
        } else {
          modules.set(modulePath, [module]);
        }
      }

      return modules;
    },
    new Map<string, WebpackModule[]>()
  );
}

function determineFilesToCheckForErrors(
  checkAllFilesForErrors: boolean,
  instance: TSInstance
) {
  const { files, modifiedFiles, filesWithErrors, otherFiles } = instance;
  // calculate array of files to check
  const filesToCheckForErrors: TSFiles = new Map<string, TSFile>();
  if (checkAllFilesForErrors) {
    // check all files on initial run
    for (const [filePath, file] of files) {
      filesToCheckForErrors.set(filePath, file);
    }
    for (const [filePath, file] of otherFiles) {
      filesToCheckForErrors.set(filePath, file);
    }
  } else if (modifiedFiles !== null && modifiedFiles !== undefined) {
    // check all modified files, and all dependants
    for (const modifiedFileName of modifiedFiles.keys()) {
      collectAllDependants(
        instance.reverseDependencyGraph,
        modifiedFileName
      ).forEach(fileName => {
        const fileToCheckForErrors =
          files.get(fileName) || otherFiles.get(fileName);
        filesToCheckForErrors.set(fileName, fileToCheckForErrors!);
      });
    }
  }

  // re-check files with errors from previous build
  if (filesWithErrors !== undefined) {
    for (const [fileWithErrorName, fileWithErrors] of filesWithErrors) {
      filesToCheckForErrors.set(fileWithErrorName, fileWithErrors);
    }
  }
  return filesToCheckForErrors;
}

function provideErrorsToWebpack(
  filesToCheckForErrors: TSFiles,
  filesWithErrors: TSFiles,
  compilation: webpack.compilation.Compilation,
  modules: Map<string, WebpackModule[]>,
  instance: TSInstance
) {
  const {
    compiler,
    files,
    loaderOptions,
    compilerOptions,
    otherFiles
  } = instance;

  const filePathRegex =
    compilerOptions.checkJs === true
      ? constants.dtsTsTsxJsJsxRegex
      : constants.dtsTsTsxRegex;

  // I’m pretty sure this will never be undefined here
  const program = ensureProgram(instance);
  for (const filePath of filesToCheckForErrors.keys()) {
    if (filePath.match(filePathRegex) === null) {
      continue;
    }

    const sourceFile = program && program.getSourceFile(filePath);
    // If the source file is undefined, that probably means it’s actually part of an unbuilt project reference,
    // which will have already produced a more useful error than the one we would get by proceeding here.
    // If it’s undefined and we’re not using project references at all, I guess carry on so the user will
    // get a useful error about which file was unexpectedly missing.
    if (isUsingProjectReferences(instance) && sourceFile === undefined) {
      continue;
    }

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
    const associatedModules = modules.get(filePath);
    if (associatedModules !== undefined) {
      associatedModules.forEach(module => {
        // remove any existing errors
        removeTSLoaderErrors(module.errors);

        // append errors
        const formattedErrors = formatErrors(
          errors,
          loaderOptions,
          instance.colors,
          compiler,
          { module },
          compilation.compiler.context
        );

        module.errors.push(...formattedErrors);
        compilation.errors.push(...formattedErrors);
      });
    } else {
      // otherwise it's a more generic error
      const formattedErrors = formatErrors(
        errors,
        loaderOptions,
        instance.colors,
        compiler,
        { file: filePath },
        compilation.compiler.context
      );

      compilation.errors.push(...formattedErrors);
    }
  }
}

function provideSolutionErrorsToWebpack(
  compilation: webpack.compilation.Compilation,
  modules: Map<string, WebpackModule[]>,
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
    solutionBuilderHost: { diagnostics }
  } = instance;

  for (const [filePath, perFileDiagnostics] of diagnostics.perFile) {
    // if we have access to a webpack module, use that
    const associatedModules = modules.get(filePath);
    if (associatedModules !== undefined) {
      associatedModules.forEach(module => {
        // remove any existing errors
        removeTSLoaderErrors(module.errors);

        // append errors
        const formattedErrors = formatErrors(
          perFileDiagnostics,
          loaderOptions,
          instance.colors,
          compiler,
          { module },
          compilation.compiler.context
        );

        module.errors.push(...formattedErrors);
        compilation.errors.push(...formattedErrors);
      });
    } else {
      // otherwise it's a more generic error
      const formattedErrors = formatErrors(
        perFileDiagnostics,
        loaderOptions,
        instance.colors,
        compiler,
        { file: filePath },
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
  for (const filePath of filesToCheckForErrors.keys()) {
    if (filePath.match(constants.tsTsxRegex) === null) {
      continue;
    }

    const outputFiles = getEmitOutput(instance, filePath);
    const declarationFiles = outputFiles.filter(outputFile =>
      outputFile.name.match(constants.dtsDtsxOrDtsDtsxMapRegex)
    );

    declarationFiles.forEach(declarationFile => {
      const assetPath = path.relative(
        compilation.compiler.outputPath,
        declarationFile.name
      );
      compilation.assets[assetPath] = {
        source: () => declarationFile.text,
        size: () => declarationFile.text.length
      };
    });
  }
}

/**
 * gather all .tsbuildinfo for the project
 */
function provideTsBuildInfoFilesToWebpack(
  instance: TSInstance,
  compilation: webpack.compilation.Compilation
) {
  if (instance.solutionBuilderHost && instance.modifiedFiles) {
    const program = ensureProgram(instance);
    if (program) {
      forEachResolvedProjectReference(
        program.getResolvedProjectReferences(),
        resolvedRef => {
          if (
            resolvedRef.commandLine.fileNames.some(f =>
              instance.modifiedFiles!.has(path.resolve(f))
            )
          ) {
            // TODO:: update compiler to expose this
            const buildInfoPath = (instance.compiler as any).getOutputPathForBuildInfo(
              resolvedRef.commandLine.options
            );
            if (buildInfoPath) {
              const text = instance.compiler.sys.readFile(buildInfoPath);
              if (text) {
                const assetPath = path.relative(
                  compilation.compiler.outputPath,
                  path.resolve(buildInfoPath)
                );
                compilation.assets[assetPath] = {
                  source: () => text,
                  size: () => text.length
                };
              }
            }
          }
        }
      );
    }
  }
}

/**
 * handle all other errors. The basic approach here to get accurate error
 * reporting is to start with a "blank slate" each compilation and gather
 * all errors from all files. Since webpack tracks errors in a module from
 * compilation-to-compilation, and since not every module always runs through
 * the loader, we need to detect and remove any pre-existing errors.
 */
function removeTSLoaderErrors(errors: WebpackError[]) {
  let index = -1;
  let length = errors.length;
  while (++index < length) {
    if (errors[index].loaderSource === 'ts-loader') {
      errors.splice(index--, 1);
      length--;
    }
  }
}
