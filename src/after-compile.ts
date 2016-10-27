import typescript = require('typescript');
import interfaces = require('./interfaces');
import path = require('path');
import utils = require('./utils');

function makeAfterCompile(
    instance: interfaces.TSInstance,
    compiler: typeof typescript,
    servicesHost: typescript.LanguageServiceHost,
    configFilePath: string
) {
    const languageService = instance.languageService = compiler.createLanguageService(servicesHost, compiler.createDocumentRegistry());

    let getCompilerOptionDiagnostics = true;
    let checkAllFilesForErrors = true;

    return (compilation: interfaces.WebpackCompilation, callback: () => void) => {
        // Don't add errors for child compilations
        if (compilation.compiler.isChild()) {
            callback();
            return;
        }

        removeTSLoaderErrors(compilation.errors);

        // handle compiler option errors after the first compile
        if (getCompilerOptionDiagnostics) {
            getCompilerOptionDiagnostics = false;
            utils.pushArray(
                compilation.errors,
                utils.formatErrors(languageService.getCompilerOptionsDiagnostics(), instance, { file: configFilePath || 'tsconfig.json' }));
        }

        // build map of all modules based on normalized filename
        // this is used for quick-lookup when trying to find modules
        // based on filepath
        let modules: { [modulePath: string]: interfaces.WebpackModule[] } = {};
        compilation.modules.forEach(module => {
            if (module.resource) {
                let modulePath = path.normalize(module.resource);
                if (utils.hasOwnProperty(modules, modulePath)) {
                    let existingModules = modules[modulePath];
                    if (existingModules.indexOf(module) === -1) {
                        existingModules.push(module);
                    }
                } else {
                    modules[modulePath] = [module];
                }
            }
        });

        // gather all errors from TypeScript and output them to webpack
        let filesWithErrors: interfaces.TSFiles = {};
        // calculate array of files to check
        let filesToCheckForErrors: interfaces.TSFiles = null;
        if (checkAllFilesForErrors) {
            // check all files on initial run
            filesToCheckForErrors = instance.files;
            checkAllFilesForErrors = false;
        } else {
            filesToCheckForErrors = {};
            // check all modified files, and all dependants
            Object.keys(instance.modifiedFiles).forEach(modifiedFileName => {
                collectAllDependants(instance, modifiedFileName).forEach(fName => {
                    filesToCheckForErrors[fName] = instance.files[fName];
                });
            });
        }
        // re-check files with errors from previous build
        if (instance.filesWithErrors) {
            Object.keys(instance.filesWithErrors).forEach(fileWithErrorName =>
                filesToCheckForErrors[fileWithErrorName] = instance.filesWithErrors[fileWithErrorName]
            );
        }

        Object.keys(filesToCheckForErrors)
            .filter(filePath => !!filePath.match(/(\.d)?\.ts(x?)$/))
            .forEach(filePath => {
                let errors = languageService.getSyntacticDiagnostics(filePath).concat(languageService.getSemanticDiagnostics(filePath));
                if (errors.length > 0) {
                    if (null === filesWithErrors) {
                        filesWithErrors = {};
                    }
                    filesWithErrors[filePath] = instance.files[filePath];
                }

                // if we have access to a webpack module, use that
                if (utils.hasOwnProperty(modules, filePath)) {
                    let associatedModules = modules[filePath];

                    associatedModules.forEach(module => {
                        // remove any existing errors
                        removeTSLoaderErrors(module.errors);

                        // append errors
                        let formattedErrors = utils.formatErrors(errors, instance, { module });
                        utils.pushArray(module.errors, formattedErrors);
                        utils.pushArray(compilation.errors, formattedErrors);
                    });
                } else {
                    // otherwise it's a more generic error
                    utils.pushArray(compilation.errors, utils.formatErrors(errors, instance, { file: filePath }));
                }
            });


        // gather all declaration files from TypeScript and output them to webpack
        Object.keys(filesToCheckForErrors)
            .filter(filePath => !!filePath.match(/\.ts(x?)$/))
            .forEach(filePath => {
                let output = languageService.getEmitOutput(filePath);
                let declarationFile = output.outputFiles.filter(fp => !!fp.name.match(/\.d.ts$/)).pop();
                if (declarationFile) {
                    let assetPath = path.relative(compilation.compiler.context, declarationFile.name);
                    compilation.assets[assetPath] = {
                        source: () => declarationFile.text,
                        size: () => declarationFile.text.length,
                    };
                }
            });

        instance.filesWithErrors = filesWithErrors;
        instance.modifiedFiles = null;
        callback();
    };
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
function collectAllDependants(instance: interfaces.TSInstance, fileName: string, collected: any = {}): string[] {
    let result = {};
    result[fileName] = true;
    collected[fileName] = true;
    if (instance.reverseDependencyGraph[fileName]) {
        Object.keys(instance.reverseDependencyGraph[fileName]).forEach(dependantFileName => {
            if (!collected[dependantFileName]) {
                collectAllDependants(instance, dependantFileName, collected).forEach(fName => result[fName] = true);
            }
        });
    }
    return Object.keys(result);
}

export = makeAfterCompile;
