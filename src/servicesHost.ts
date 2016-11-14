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
        compilerOptions.newLine === 0 /* CarriageReturnLineFeed */ ? constants.CarriageReturnLineFeed :
        compilerOptions.newLine === 1 /* LineFeed */ ? constants.LineFeed :
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
                let text = utils.readFile(fileName);
                if (!text) { return undefined; }

                file = files[fileName] = { version: 0, text };
            }

            return compiler.ScriptSnapshot.fromString(file.text);
        },
        /**
         * getDirectories is also required for full import and type reference completions.
         * Without it defined, certain completions will not be provided
         */
        getDirectories: typescript.sys ? (<any> typescript.sys).getDirectories : undefined,

        /**
         * For @types expansion, these two functions are needed.
         */
        directoryExists: typescript.sys ? (<any> typescript.sys).directoryExists : undefined,
        getCurrentDirectory: () => process.cwd(),

        getCompilationSettings: () => compilerOptions,
        getDefaultLibFileName: (options: typescript.CompilerOptions) => compiler.getDefaultLibFilePath(options),
        getNewLine: () => newLine,
        log: log.log,
        resolveModuleNames: (moduleNames: string[], containingFile: string) => {
            let resolvedModules: interfaces.ResolvedModule[] = [];

            for (let moduleName of moduleNames) {
                let resolutionResult: interfaces.ResolvedModule;

                try {
                    let resolvedFileName: string = resolver.resolveSync(path.normalize(path.dirname(containingFile)), moduleName);
                    resolvedFileName = utils.appendTsSuffixIfMatch(appendTsSuffixTo, resolvedFileName);

                    if (resolvedFileName.match(scriptRegex)) {
                        resolutionResult = { resolvedFileName };
                    }
                } catch (e) {}

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

                resolvedModules.push(resolutionResult);
            }

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

            return resolvedModules;
        },
    };
}

export = makeServicesHost;
