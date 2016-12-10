import typescript = require('typescript');
import constants = require('./constants');
import interfaces = require('./interfaces');
import logger = require('./logger');
import path = require('path');
import makeResolver = require('./resolver');
import utils = require('./utils');

/**
 * Create the TypeScript language service
 */
function makeServicesHost(
    scriptRegex: RegExp,
    log: logger.Logger,
    loader: interfaces.Webpack,
    instance: interfaces.TSInstance,
    appendTsSuffixTo: RegExp[]
) {
    const { compiler, compilerOptions, files } = instance;

    const newLine =
        compilerOptions.newLine === constants.CarriageReturnLineFeedCode ? constants.CarriageReturnLineFeed :
        compilerOptions.newLine === constants.LineFeedCode ? constants.LineFeed :
        constants.EOL;

    // make a (sync) resolver that follows webpack's rules
    const resolver = makeResolver(loader.options);

    const moduleResolutionHost = {
        fileExists: (fileName: string) => utils.readFile(fileName) !== undefined,
        readFile: (fileName: string) => utils.readFile(fileName),
    };

    return {
        getProjectVersion: () => `${instance.version}`,
        getScriptFileNames: () => Object.keys(files).filter(filePath => scriptRegex.test(filePath)),
        getScriptVersion: (fileName: string) => {
            fileName = path.normalize(fileName);
            return files[fileName] && files[fileName].version.toString();
        },
        getScriptSnapshot: (fileName: string) => {
            // This is called any time TypeScript needs a file's text
            // We either load from memory or from disk
            fileName = path.normalize(fileName);
            let file = files[fileName];

            if (!file) {
                const text = utils.readFile(fileName);
                if (!text) { return undefined; }

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
        getCurrentDirectory: () => process.cwd(),

        getCompilationSettings: () => compilerOptions,
        getDefaultLibFileName: (options: typescript.CompilerOptions) => compiler.getDefaultLibFilePath(options),
        getNewLine: () => newLine,
        log: log.log,
        resolveModuleNames: (moduleNames: string[], containingFile: string) => 
            resolveModuleNames(
                resolver, moduleResolutionHost, appendTsSuffixTo, scriptRegex, instance,
                moduleNames, containingFile)
    };
}

function resolveModuleNames(
    resolver: interfaces.ResolveSync,
    moduleResolutionHost: interfaces.ModuleResolutionHost,
    appendTsSuffixTo: RegExp[],
    scriptRegex: RegExp,
    instance: interfaces.TSInstance,

    moduleNames: string[],
    containingFile: string
) {
    const resolvedModules = moduleNames.map(moduleName => 
        resolveModuleName(resolver, moduleResolutionHost, appendTsSuffixTo, scriptRegex, instance,
            moduleName, containingFile)
    );

    populateDependencyGraphs(resolvedModules, instance, containingFile);

    return resolvedModules;
}

function resolveModuleName(
    resolveSync: interfaces.ResolveSync,
    moduleResolutionHost: interfaces.ModuleResolutionHost,
    appendTsSuffixTo: RegExp[],
    scriptRegex: RegExp,
    instance: interfaces.TSInstance,

    moduleName: string,
    containingFile: string
) {
    const { compiler, compilerOptions } = instance;
    
    let resolutionResult: interfaces.ResolvedModule;

    try {
        let resolvedFileName = resolveSync(undefined, path.normalize(path.dirname(containingFile)), moduleName);
        resolvedFileName = utils.appendTsSuffixIfMatch(appendTsSuffixTo, resolvedFileName);

        if (resolvedFileName.match(scriptRegex)) {
            resolutionResult = { resolvedFileName };
        }
    } catch (e) { }

    const tsResolution = compiler.resolveModuleName(moduleName, containingFile, compilerOptions, moduleResolutionHost);

    if (tsResolution.resolvedModule) {
        let tsResolutionResult: interfaces.ResolvedModule = {
            resolvedFileName: path.normalize(tsResolution.resolvedModule.resolvedFileName),
            isExternalLibraryImport: tsResolution.resolvedModule.isExternalLibraryImport
        };
        if (resolutionResult) {
            if (resolutionResult.resolvedFileName === tsResolutionResult.resolvedFileName) {
                resolutionResult.isExternalLibraryImport = tsResolutionResult.isExternalLibraryImport;
            }
        } else {
            resolutionResult = tsResolutionResult;
        }
    }
    return resolutionResult;
}

function populateDependencyGraphs(
    resolvedModules: interfaces.ResolvedModule[],
    instance: interfaces.TSInstance,
    containingFile: string
) {
    const importedFiles = resolvedModules
        .filter(m => m !== null && m !== undefined)
        .map(m => m.resolvedFileName);

    instance.dependencyGraph[path.normalize(containingFile)] = importedFiles;

    importedFiles.forEach(importedFileName => {
        if (!instance.reverseDependencyGraph[importedFileName]) {
            instance.reverseDependencyGraph[importedFileName] = {};
        }
        instance.reverseDependencyGraph[importedFileName][path.normalize(containingFile)] = true;
    });
}

export = makeServicesHost;
