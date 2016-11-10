import interfaces = require('./interfaces');
import path = require('path');
import typescript = require('typescript');
import utils = require('./utils');

function makeAfterCompile(
    instance: interfaces.TSInstance,
    configFilePath: string
) {
    let getCompilerOptionDiagnostics = true;
    let checkAllFilesForErrors = true;

    return (compilation: interfaces.WebpackCompilation, callback: () => void) => {
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

        const filesWithErrors: interfaces.TSFiles = {};
        provideErrorsToWebpack(filesToCheckForErrors, filesWithErrors, compilation, modules, instance);

        provideDeclarationFilesToWebpack(filesToCheckForErrors, instance.languageService, compilation);

        instance.filesWithErrors = filesWithErrors;
        instance.modifiedFiles = null;
        callback();
    };
}

interface Modules {
    [modulePath: string]: interfaces.WebpackModule[];
}

/**
 * handle compiler option errors after the first compile
 */
function provideCompilerOptionDiagnosticErrorsToWebpack(
    getCompilerOptionDiagnostics: boolean,
    compilation: interfaces.WebpackCompilation,
    instance: interfaces.TSInstance,
    configFilePath: string
) {
    const { languageService, loaderOptions, compiler } = instance;
    if (getCompilerOptionDiagnostics) {
        utils.registerWebpackErrors(
            compilation.errors,
            utils.formatErrors(
                languageService.getCompilerOptionsDiagnostics(),
                loaderOptions, compiler,
                { file: configFilePath || 'tsconfig.json' }));
    }
}

/**
 * build map of all modules based on normalized filename
 * this is used for quick-lookup when trying to find modules
 * based on filepath
 */
function determineModules(
    compilation: interfaces.WebpackCompilation
) {
    const modules: Modules = {};
    compilation.modules.forEach(module => {
        if (module.resource) {
            const modulePath = path.normalize(module.resource);
            if (utils.hasOwnProperty(modules, modulePath)) {
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
    instance: interfaces.TSInstance
) {
    const { files, modifiedFiles, filesWithErrors } = instance
    // calculate array of files to check
    let filesToCheckForErrors: interfaces.TSFiles = {};
    if (checkAllFilesForErrors) {
        // check all files on initial run
        filesToCheckForErrors = files;
    } else if (modifiedFiles) {
        // check all modified files, and all dependants
        Object.keys(modifiedFiles).forEach(modifiedFileName => {
            collectAllDependants(instance.reverseDependencyGraph, modifiedFileName)
                .forEach(fileName => {
                    filesToCheckForErrors[fileName] = files[fileName];
                });
        });
    }

    // re-check files with errors from previous build
    if (filesWithErrors) {
        Object.keys(filesWithErrors).forEach(fileWithErrorName =>
            filesToCheckForErrors[fileWithErrorName] = filesWithErrors[fileWithErrorName]
        );
    }
    return filesToCheckForErrors;
}

function provideErrorsToWebpack(
    filesToCheckForErrors: interfaces.TSFiles,
    filesWithErrors: interfaces.TSFiles,
    compilation: interfaces.WebpackCompilation,
    modules: Modules,
    instance: interfaces.TSInstance
) {
    const { compiler, languageService, files, loaderOptions } = instance;
    Object.keys(filesToCheckForErrors)
        .filter(filePath => !!filePath.match(/(\.d)?\.ts(x?)$/))
        .forEach(filePath => {
            const errors = languageService.getSyntacticDiagnostics(filePath).concat(languageService.getSemanticDiagnostics(filePath));
            if (errors.length > 0) {
                filesWithErrors[filePath] = files[filePath];
            }

            // if we have access to a webpack module, use that
            if (utils.hasOwnProperty(modules, filePath)) {
                const associatedModules = modules[filePath];

                associatedModules.forEach(module => {
                    // remove any existing errors
                    removeTSLoaderErrors(module.errors);

                    // append errors
                    const formattedErrors = utils.formatErrors(errors, loaderOptions, compiler, { module });
                    utils.registerWebpackErrors(module.errors, formattedErrors);
                    utils.registerWebpackErrors(compilation.errors, formattedErrors);
                });
            } else {
                // otherwise it's a more generic error
                utils.registerWebpackErrors(compilation.errors, utils.formatErrors(errors, loaderOptions, compiler, { file: filePath }));
            }
        });
}

/**
 * gather all declaration files from TypeScript and output them to webpack
 */
function provideDeclarationFilesToWebpack(
    filesToCheckForErrors: interfaces.TSFiles,
    languageService: typescript.LanguageService,
    compilation: interfaces.WebpackCompilation
) {
    Object.keys(filesToCheckForErrors)
        .filter(filePath => !!filePath.match(/\.ts(x?)$/))
        .forEach(filePath => {
            const output = languageService.getEmitOutput(filePath);
            const declarationFile = output.outputFiles.filter(fp => !!fp.name.match(/\.d.ts$/)).pop();
            if (declarationFile) {
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
function removeTSLoaderErrors(errors: interfaces.WebpackError[]) {
    let index = -1;
    let length = errors.length;
    while (++index < length) {
        if (errors[index].loaderSource === 'ts-loader') {
            errors.splice(index--, 1);
            length--;
        }
    }
}

/**
 * Recursively collect all possible dependants of passed file
 */
function collectAllDependants(
    reverseDependencyGraph: interfaces.ReverseDependencyGraph,
    fileName: string,
    collected: {[file:string]: boolean} = {}
): string[] {
    const result = {};
    result[fileName] = true;
    collected[fileName] = true;
    if (reverseDependencyGraph[fileName]) {
        Object.keys(reverseDependencyGraph[fileName]).forEach(dependantFileName => {
            if (!collected[dependantFileName]) {
                collectAllDependants(reverseDependencyGraph, dependantFileName, collected)
                    .forEach(fName => result[fName] = true);
            }
        });
    }
    return Object.keys(result);
}

export = makeAfterCompile;
