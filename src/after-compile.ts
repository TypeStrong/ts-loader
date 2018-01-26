import * as path from 'path';

import { collectAllDependants, formatErrors } from './utils';
import * as constants from './constants';
import { 
    TSFiles,
    TSInstance,
    WebpackCompilation,
    WebpackError,
    WebpackModule,
    TSFile
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

        const filesWithErrors: TSFiles = new Map<string, TSFile>();
        provideErrorsToWebpack(filesToCheckForErrors, filesWithErrors, compilation, modules, instance);

        provideDeclarationFilesToWebpack(filesToCheckForErrors, instance, compilation);

        instance.filesWithErrors = filesWithErrors;
        instance.modifiedFiles = null;

        callback();
    };
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

        const errorsToAdd = formatErrors(
            program ?
                program.getOptionsDiagnostics() :
                languageService!.getCompilerOptionsDiagnostics(),
            loaderOptions, instance.colors, compiler,
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
function determineModules(
    compilation: WebpackCompilation
) {
    // TODO: Convert to reduce
    const modules = new Map<string, WebpackModule[]>();
    compilation.modules.forEach(module => {
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
    });
    return modules;
}

function determineFilesToCheckForErrors(
    checkAllFilesForErrors: boolean,
    instance: TSInstance
) {
    const { files, modifiedFiles, filesWithErrors, otherFiles } = instance
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
            collectAllDependants(instance.reverseDependencyGraph, modifiedFileName)
                .forEach(fileName => {
                    const fileToCheckForErrors = files.get(fileName) || otherFiles.get(fileName);
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
    compilation: WebpackCompilation,
    modules: Map<string, WebpackModule[]>,
    instance: TSInstance
) {
    const { compiler, program, languageService, files, loaderOptions, compilerOptions, otherFiles } = instance;

    let filePathRegex = !!compilerOptions.checkJs ? constants.dtsTsTsxJsJsxRegex : constants.dtsTsTsxRegex;

    for (const filePath of filesToCheckForErrors.keys()) {
        if (!filePath.match(filePathRegex)) {
            continue;
        }

        const sourceFile = program && program.getSourceFile(filePath);
        const errors = program ?
            program.getSyntacticDiagnostics(sourceFile).concat(program.getSemanticDiagnostics(sourceFile)) :
            languageService!.getSyntacticDiagnostics(filePath).concat(languageService!.getSemanticDiagnostics(filePath));
        if (errors.length > 0) {
            const fileWithError = files.get(filePath) || otherFiles.get(filePath);
            filesWithErrors.set(filePath, fileWithError!);
        }

        // if we have access to a webpack module, use that
        const associatedModules = modules.get(filePath)
        if (associatedModules !== undefined) {
            associatedModules.forEach(module => {
                // remove any existing errors
                removeTSLoaderErrors(module.errors);

                // append errors
                const formattedErrors = formatErrors(errors, loaderOptions,
                    instance.colors, compiler, { module },
                    compilation.compiler.context);

                module.errors.push(...formattedErrors);
                compilation.errors.push(...formattedErrors);
            });
        } else {
            // otherwise it's a more generic error
            const formattedErrors = formatErrors(errors,
                loaderOptions, instance.colors, compiler, { file: filePath },
                compilation.compiler.context);

            compilation.errors.push(...formattedErrors);
        }
    }
}

/**
 * gather all declaration files from TypeScript and output them to webpack
 */
function provideDeclarationFilesToWebpack(
    filesToCheckForErrors: TSFiles,
    instance: TSInstance,
    compilation: WebpackCompilation
) {
    for (const filePath of filesToCheckForErrors.keys()) {
        if (!filePath.match(constants.tsTsxRegex)) {
            continue;
        }

        const outputFiles = getEmitOutput(instance, filePath);
        const declarationFile = outputFiles.filter(outputFile => outputFile.name.match(constants.dtsDtsxRegex)).pop();
        if (declarationFile !== undefined) {
            const assetPath = path.relative(compilation.compiler.context, declarationFile.name);
            compilation.assets[assetPath] = {
                source: () => declarationFile.text,
                size: () => declarationFile.text.length,
            };
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
