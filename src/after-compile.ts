import * as path from 'path';

import { collectAllDependants, formatErrors, hasOwnProperty, registerWebpackErrors } from './utils';
import * as constants from './constants';
import { 
    TSFiles,
    TSInstance,
    WebpackCompilation,
    WebpackError,
    WebpackModule
} from './interfaces';
import { getEmitOutput } from './instances';

export function makeAfterCompile(
    instance: TSInstance,
    configFilePath: string | undefined
) {
    let getCompilerOptionDiagnostics = true;
    let checkAllFilesForErrors = true;

    return (compilation: WebpackCompilation, callback: () => void) => {
        // Don't add errors for child compilations
        if (compilation.compiler.isChild()) {
            callback();
            return;
        }

        removeTSLoaderErrors(compilation.errors);

        provideCompilerOptionDiagnosticErrorsToWebpack(getCompilerOptionDiagnostics, compilation, instance, configFilePath);
        getCompilerOptionDiagnostics = false;

        const modules = determineModules(compilation);

        const filesToCheckForErrors = determineFilesToCheckForErrors(checkAllFilesForErrors, instance);
        checkAllFilesForErrors = false;

        const filesWithErrors: TSFiles = {};
        provideErrorsToWebpack(filesToCheckForErrors, filesWithErrors, compilation, modules, instance);

        provideDeclarationFilesToWebpack(filesToCheckForErrors, instance, compilation);

        instance.filesWithErrors = filesWithErrors;
        instance.modifiedFiles = null;
        callback();
    };
}

interface Modules {
    [modulePath: string]: WebpackModule[];
}

/**
 * handle compiler option errors after the first compile
 */
function provideCompilerOptionDiagnosticErrorsToWebpack(
    getCompilerOptionDiagnostics: boolean,
    compilation: WebpackCompilation,
    instance: TSInstance,
    configFilePath: string | undefined
) {
    if (getCompilerOptionDiagnostics) {
        const { languageService, loaderOptions, compiler, program } = instance;
        registerWebpackErrors(
            compilation.errors,
            formatErrors(
                program ?
                    program.getOptionsDiagnostics() :
                    languageService!.getCompilerOptionsDiagnostics(),
                loaderOptions, instance.colors, compiler,
                { file: configFilePath || 'tsconfig.json' }));
    }
}

/**
 * build map of all modules based on normalized filename
 * this is used for quick-lookup when trying to find modules
 * based on filepath
 */
function determineModules(
    compilation: WebpackCompilation
) {
    const modules: Modules = {};
    compilation.modules.forEach(module => {
        if (module.resource) {
            const modulePath = path.normalize(module.resource);
            if (hasOwnProperty(modules, modulePath)) {
                const existingModules = modules[modulePath];
                if (existingModules.indexOf(module) === -1) {
                    existingModules.push(module);
                }
            } else {
                modules[modulePath] = [module];
            }
        }
    });
    return modules;
}

function determineFilesToCheckForErrors(
    checkAllFilesForErrors: boolean,
    instance: TSInstance
) {
    const { files, modifiedFiles, filesWithErrors, otherFiles } = instance
    // calculate array of files to check
    let filesToCheckForErrors: TSFiles = {};
    if (checkAllFilesForErrors) {
        // check all files on initial run
        Object.keys(files).forEach(fileName => {
            filesToCheckForErrors[fileName] = files[fileName];
        });
        Object.keys(otherFiles).forEach(fileName => {
            filesToCheckForErrors[fileName] = otherFiles[fileName];
        });
    } else if (modifiedFiles !== null && modifiedFiles !== undefined) {
        // check all modified files, and all dependants
        Object.keys(modifiedFiles).forEach(modifiedFileName => {
            collectAllDependants(instance.reverseDependencyGraph, modifiedFileName)
                .forEach(fileName => {
                    filesToCheckForErrors[fileName] = files[fileName] || otherFiles[fileName];
                });
        });
    }

    // re-check files with errors from previous build
    if (filesWithErrors !== undefined) {
        Object.keys(filesWithErrors).forEach(fileWithErrorName =>
            filesToCheckForErrors[fileWithErrorName] = filesWithErrors[fileWithErrorName]
        );
    }
    return filesToCheckForErrors;
}

function provideErrorsToWebpack(
    filesToCheckForErrors: TSFiles,
    filesWithErrors: TSFiles,
    compilation: WebpackCompilation,
    modules: Modules,
    instance: TSInstance
) {
    const { compiler, program, languageService, files, loaderOptions, compilerOptions, otherFiles } = instance;

    let filePathRegex = !!compilerOptions.checkJs ? constants.dtsTsTsxJsJsxRegex : constants.dtsTsTsxRegex;

    Object.keys(filesToCheckForErrors)
        .filter(filePath => filePath.match(filePathRegex))
        .forEach(filePath => {
            const sourceFile = program && program.getSourceFile(filePath);
            const errors = program ?
                program.getSyntacticDiagnostics(sourceFile).concat(program.getSemanticDiagnostics(sourceFile)) :
                languageService!.getSyntacticDiagnostics(filePath).concat(languageService!.getSemanticDiagnostics(filePath));
            if (errors.length > 0) {
                filesWithErrors[filePath] = files[filePath] || otherFiles[filePath];
            }

            // if we have access to a webpack module, use that
            if (hasOwnProperty(modules, filePath)) {
                const associatedModules = modules[filePath];

                associatedModules.forEach(module => {
                    // remove any existing errors
                    removeTSLoaderErrors(module.errors);

                    // append errors
                    const formattedErrors = formatErrors(errors, loaderOptions, instance.colors, compiler, { module });
                    registerWebpackErrors(module.errors, formattedErrors);
                    registerWebpackErrors(compilation.errors, formattedErrors);
                });
            } else {
                // otherwise it's a more generic error
                registerWebpackErrors(compilation.errors, formatErrors(errors, loaderOptions, instance.colors, compiler, { file: filePath }));
            }
        });
}

/**
 * gather all declaration files from TypeScript and output them to webpack
 */
function provideDeclarationFilesToWebpack(
    filesToCheckForErrors: TSFiles,
    instance: TSInstance,
    compilation: WebpackCompilation
) {
    Object.keys(filesToCheckForErrors)
        .filter(filePath => filePath.match(constants.tsTsxRegex))
        .forEach(filePath => {
            const outputFiles = getEmitOutput(instance, filePath);
            const declarationFile = outputFiles.filter(outputFile => outputFile.name.match(constants.dtsDtsxRegex)).pop();
            if (declarationFile !== undefined) {
                const assetPath = path.relative(compilation.compiler.context, declarationFile.name);
                compilation.assets[assetPath] = {
                    source: () => declarationFile.text,
                    size: () => declarationFile.text.length,
                };
            }
        });
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
