import interfaces = require('./interfaces');
import path = require('path');
import utils = require('./utils');

function makeAfterCompile(
    instance: interfaces.TSInstance,
    configFilePath: string
) {
    const { compiler, languageService } = instance;

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
            utils.registerWebpackErrors(
                compilation.errors,
                utils.formatErrors(languageService.getCompilerOptionsDiagnostics(),
                    instance.loaderOptions,
                    compiler,
                    { file: configFilePath || 'tsconfig.json' }));
        }

        // build map of all modules based on normalized filename
        // this is used for quick-lookup when trying to find modules
        // based on filepath
        const modules: { [modulePath: string]: interfaces.WebpackModule[] } = {};
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
                    const associatedModules = modules[filePath];

                    associatedModules.forEach(module => {
                        // remove any existing errors
                        removeTSLoaderErrors(module.errors);

                        // append errors
                        const formattedErrors = utils.formatErrors(errors, instance.loaderOptions, compiler, { module });
                        utils.registerWebpackErrors(module.errors, formattedErrors);
                        utils.registerWebpackErrors(compilation.errors, formattedErrors);
                    });
                } else {
                    // otherwise it's a more generic error
                    utils.registerWebpackErrors(compilation.errors, utils.formatErrors(errors, instance.loaderOptions, compiler, { file: filePath }));
                }
            });

        // gather all declaration files from TypeScript and output them to webpack
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
