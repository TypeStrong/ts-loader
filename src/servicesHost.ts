import * as typescript from 'typescript';
import * as path from 'path';

import * as constants from './constants';
import * as logger from './logger';
import { makeResolver } from './resolver';
import { appendSuffixesIfMatch, readFile } from './utils';
import { 
    ModuleResolutionHost,
    ResolvedModule,
    ResolveSync,
    TSInstance,
    Webpack
} from './interfaces';

/**
 * Create the TypeScript language service
 */
export function makeServicesHost(
    scriptRegex: RegExp,
    log: logger.Logger,
    loader: Webpack,
    instance: TSInstance,
    appendTsSuffixTo: RegExp[],
    appendTsxSuffixTo: RegExp[]
) {
    const { compiler, compilerOptions, files } = instance;

    const newLine =
        compilerOptions.newLine === constants.CarriageReturnLineFeedCode ? constants.CarriageReturnLineFeed :
        compilerOptions.newLine === constants.LineFeedCode ? constants.LineFeed :
        constants.EOL;

    // make a (sync) resolver that follows webpack's rules
    const resolveSync = makeResolver(loader.options);

    const moduleResolutionHost: ModuleResolutionHost = {
        fileExists: (fileName: string) => readFile(fileName) !== undefined,
        readFile: (fileName: string) => readFile(fileName)!,
    };

    return {
        getProjectVersion: () => `${instance.version}`,
        getScriptFileNames: () => Object.keys(files).filter(filePath => filePath.match(scriptRegex)),
        getScriptVersion: (fileName: string) => {
            fileName = path.normalize(fileName);
            const file = files[fileName];
            return file === undefined ? '' : file.version.toString();
        },
        getScriptSnapshot: (fileName: string) => {
            // This is called any time TypeScript needs a file's text
            // We either load from memory or from disk
            fileName = path.normalize(fileName);
            let file = files[fileName];

            if (file === undefined) {
                const text = readFile(fileName);
                if (text === undefined) { return undefined; }

                file = files[fileName] = { version: 0, text };
            }

            return compiler.ScriptSnapshot.fromString(file.text);
        },
        /**
         * getDirectories is also required for full import and type reference completions.
         * Without it defined, certain completions will not be provided
         */
        getDirectories: compiler.sys ? (<any> compiler.sys).getDirectories : undefined,

        /**
         * For @types expansion, these two functions are needed.
         */
        directoryExists: compiler.sys ? (<any> compiler.sys).directoryExists : undefined,

        // The following three methods are necessary for @types resolution from TS 2.4.1 onwards see: https://github.com/Microsoft/TypeScript/issues/16772
        fileExists: compiler.sys ? (<any> compiler.sys).fileExists : undefined,
        readFile: compiler.sys ? (<any> compiler.sys).readFile : undefined,
        readDirectory: compiler.sys ? (<any> compiler.sys).readDirectory : undefined,

        getCurrentDirectory: () => process.cwd(),

        getCompilationSettings: () => compilerOptions,
        getDefaultLibFileName: (options: typescript.CompilerOptions) => compiler.getDefaultLibFilePath(options),
        getNewLine: () => newLine,
        log: log.log,
        resolveModuleNames: (moduleNames: string[], containingFile: string) =>
            resolveModuleNames(
                resolveSync, moduleResolutionHost, appendTsSuffixTo, appendTsxSuffixTo, scriptRegex, instance,
                moduleNames, containingFile),
        getCustomTransformers: () => instance.transformers
    };
}

function resolveModuleNames(
    resolveSync: ResolveSync,
    moduleResolutionHost: ModuleResolutionHost,
    appendTsSuffixTo: RegExp[],
    appendTsxSuffixTo: RegExp[],
    scriptRegex: RegExp,
    instance: TSInstance,
    moduleNames: string[],
    containingFile: string
) {
    const resolvedModules = moduleNames.map(moduleName =>
        resolveModuleName(resolveSync, moduleResolutionHost, appendTsSuffixTo, appendTsxSuffixTo, scriptRegex, instance,
            moduleName, containingFile)
    );

    populateDependencyGraphs(resolvedModules, instance, containingFile);

    return resolvedModules;
}

function resolveModuleName(
    resolveSync: ResolveSync,
    moduleResolutionHost: ModuleResolutionHost,
    appendTsSuffixTo: RegExp[],
    appendTsxSuffixTo: RegExp[],
    scriptRegex: RegExp,
    instance: TSInstance,

    moduleName: string,
    containingFile: string
) {
    const { compiler, compilerOptions } = instance;

    let resolutionResult: ResolvedModule;

    try {
        const originalFileName = resolveSync(undefined, path.normalize(path.dirname(containingFile)), moduleName);

        const resolvedFileName = appendTsSuffixTo.length > 0 || appendTsxSuffixTo.length > 0
            ? appendSuffixesIfMatch({
                '.ts': appendTsSuffixTo,
                '.tsx': appendTsxSuffixTo,
            }, originalFileName)
            : originalFileName;

        if (resolvedFileName.match(scriptRegex)) {
            resolutionResult = { resolvedFileName, originalFileName };
        }
    } catch (e) { }

    const tsResolution = compiler.resolveModuleName(moduleName, containingFile, compilerOptions, moduleResolutionHost);

    if (tsResolution.resolvedModule !== undefined) {
        const resolvedFileName = path.normalize(tsResolution.resolvedModule.resolvedFileName);
        const tsResolutionResult: ResolvedModule = {
            originalFileName: resolvedFileName,
            resolvedFileName,
            isExternalLibraryImport: tsResolution.resolvedModule.isExternalLibraryImport
        };
        if (resolutionResult!) {
            if (resolutionResult!.resolvedFileName === tsResolutionResult.resolvedFileName) {
                resolutionResult!.isExternalLibraryImport = tsResolutionResult.isExternalLibraryImport;
            }
        } else {
            resolutionResult = tsResolutionResult;
        }
    }
    return resolutionResult!;
}

function populateDependencyGraphs(
    resolvedModules: ResolvedModule[],
    instance: TSInstance,
    containingFile: string
) {
    resolvedModules = resolvedModules
        .filter(m => m !== null && m !== undefined);

    instance.dependencyGraph[path.normalize(containingFile)] = resolvedModules;

    resolvedModules.forEach(resolvedModule => {
        if (instance.reverseDependencyGraph[resolvedModule.resolvedFileName] === undefined) {
            instance.reverseDependencyGraph[resolvedModule.resolvedFileName] = {};
        }
        instance.reverseDependencyGraph[resolvedModule.resolvedFileName]![path.normalize(containingFile)] = true;
    });
}
