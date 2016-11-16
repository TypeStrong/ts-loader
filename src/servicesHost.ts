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
    const fileStorage = createFileStorage(instance, files)
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
            let file = fileStorage.getFile(files, fileName);

            if (!file) {
                let text = utils.readFile(fileName);
                if (!text) { return undefined; }

                file = fileStorage.setFile(files, fileName, { version: 0, text });
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
        resolveModuleNames: (moduleNames: string[], containingFile: string) => 
            resolveModuleNames(
                resolver, moduleResolutionHost, appendTsSuffixTo, scriptRegex, instance,
                moduleNames, containingFile)
    };
}

function resolveModuleNames(
    resolver: { resolveSync(path:string, moduleName: string): string },
    moduleResolutionHost: {
        fileExists(fileName: string): boolean,
        readFile(fileName: string): string,
    },
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
    resolver: { resolveSync(path:string, moduleName: string): string },
    moduleResolutionHost: {
        fileExists(fileName: string): boolean,
        readFile(fileName: string): string,
    },
    appendTsSuffixTo: RegExp[],
    scriptRegex: RegExp,
    instance: interfaces.TSInstance,

    moduleName: string,
    containingFile: string
) {
    const { compiler, compilerOptions } = instance;

    let resolutionResult: interfaces.ResolvedModule;

    try {
        let resolvedFileName: string = resolver.resolveSync(path.normalize(path.dirname(containingFile)), moduleName);
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

/**
 * Provides implementation of FileStorage depending of loader options.
 */
function createFileStorage(instance: interfaces.TSInstance, files: interfaces.TSFiles): FileStorage {
    if (instance.loaderOptions.sharedNodeModules) {
        return new SharedNodeModulesStorage(files)
    } else {
        return new DefaultFileStorage()
    }
}

/**
 * Provides methods for getting and setting TSFile by file name from TSFiles
 */
interface FileStorage {
    getFile(files: interfaces.TSFiles, fileName: string): interfaces.TSFile
    setFile(files: interfaces.TSFiles, fileName: string, file: interfaces.TSFile): interfaces.TSFile
}

/**
 * Reads and writes values into provided TSFiles without any additional logic.
 */
class DefaultFileStorage implements FileStorage {
    getFile(files: interfaces.TSFiles, fileName: string): interfaces.TSFile {
        return files[fileName]
    }

    setFile(files: interfaces.TSFiles, fileName: string, file: interfaces.TSFile): interfaces.TSFile {
        files[fileName] = file
        return file
    }
}

/**
 * Caches files by local path. It means that all files from 'node_modules' will be cached not by full path, but
 * by path like 'node_modules/somelib/somefile.ts'. And the class uses this cache to avoid adding files with the same
 * local path. It is used if sharedNodeModules=true.
 */
class SharedNodeModulesStorage implements FileStorage {
    private nodeModulesFiles = {}

    constructor(files: interfaces.TSFiles) {
        Object.keys(files).forEach(key => {
            this.nodeModulesFiles[this.createLocalPath(key)] = key
        })
    }

    private createLocalPath(fileName: string): string {
        if (fileName.indexOf('node_modules') >= 0) {
            return fileName.substring(fileName.lastIndexOf('node_modules'));
        } else {
            return fileName;
        }
    }

    getFile(files: interfaces.TSFiles, fileName: string): interfaces.TSFile {
        let result = files[this.nodeModulesFiles[this.createLocalPath(fileName)]]
        if (result) {
            return result
        }
        result = files[fileName]
        if (result) {
            this.nodeModulesFiles[this.createLocalPath(fileName)] = result
        }
        return result
    }

    setFile(files: interfaces.TSFiles, fileName: string, file: interfaces.TSFile): interfaces.TSFile {
        const previousValue = this.getFile(files, fileName)
        if (previousValue) {
            return previousValue
        }
        this.nodeModulesFiles[this.createLocalPath(fileName)] = fileName
        files[fileName] = file
        return file
    }
}

export = makeServicesHost;
