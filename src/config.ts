import * as typescript from 'typescript';
import * as path from 'path';

import * as logger from './logger';
import { formatErrors } from './utils';
import { 
    LoaderOptions,
    TSCompatibleCompiler,
    Webpack,
    WebpackError
} from './interfaces';
import { green } from 'chalk';

interface ConfigFile {
    config?: any;
    error?: typescript.Diagnostic;
}

export function getConfigFile(
    compiler: typeof typescript,
    loader: Webpack,
    loaderOptions: LoaderOptions,
    compilerCompatible: boolean,
    log: logger.Logger,
    compilerDetailsLogMessage: string
) {
    const configFilePath = findConfigFile(compiler, path.dirname(loader.resourcePath), loaderOptions.configFile);
    let configFileError: WebpackError | undefined;
    let configFile: ConfigFile;

    if (configFilePath !== undefined) {
        if (compilerCompatible) {
            log.logInfo(green(`${compilerDetailsLogMessage} and ${configFilePath}`));
        } else {
            log.logInfo(green(`ts-loader: Using config file at ${configFilePath}`));
        }

        // HACK: relies on the fact that passing an extra argument won't break
        // the old API that has a single parameter
        configFile = (<TSCompatibleCompiler> <any> compiler).readConfigFile(
            configFilePath,
            compiler.sys.readFile
        );

        if (configFile.error !== undefined) {
            configFileError = formatErrors([configFile.error], loaderOptions, compiler, { file: configFilePath })[0];
        }
    } else {
        if (compilerCompatible) { log.logInfo(green(compilerDetailsLogMessage)); }

        configFile = {
            config: {
                compilerOptions: {},
                files: [],
            },
        };
    }

    if (configFileError === undefined) {
        configFile.config.compilerOptions = Object.assign({},
            configFile.config.compilerOptions,
            loaderOptions.compilerOptions);
    }

    return {
        configFilePath,
        configFile,
        configFileError
    };
}


/**
 * Find a tsconfig file by name or by path.
 * By name, the tsconfig.json is found using the same method as `tsc`, starting in the current
 * directory and continuing up the parent directory chain.
 * By path, the file will be found by resolving the given path relative to the requesting entry file.
 * 
 * @param compiler The TypeScript compiler instance
 * @param requestDirPath The directory in which the entry point requesting the tsconfig.json lies
 * @param configFile The tsconfig file name to look for or a path to that file
 * @return The absolute path to the tsconfig file, undefined if none was found.
 */
function findConfigFile(compiler: typeof typescript, requestDirPath: string, configFile: string): string | undefined {
    // If `configFile` is an absolute path, return it right away
    if (path.isAbsolute(configFile)) {
        return compiler.sys.fileExists(configFile)
            ? configFile
            : undefined;
    }

    // If `configFile` is a relative path, resolve it.
    // We define a relative path as: starts with
    // one or two dots + a common directory delimiter
    if (configFile.match(/^\.\.?(\/|\\)/)) {
        const resolvedPath = path.resolve(requestDirPath, configFile);
        return compiler.sys.fileExists(resolvedPath)
            ? resolvedPath
            : undefined;

    // If `configFile` is a file name, find it in the directory tree
    } else {
        while (true) {
            const fileName = path.join(requestDirPath, configFile);
            if (compiler.sys.fileExists(fileName)) {
                return fileName;
            }
            const parentPath = path.dirname(requestDirPath);
            if (parentPath === requestDirPath) {
                break;
            }
            requestDirPath = parentPath;
        }

        return undefined;
    }
}

export function getConfigParseResult(
    compiler: typeof typescript,
    configFile: ConfigFile,
    configFilePath: string
) {
    let configParseResult: typescript.ParsedCommandLine;
    if (typeof (<any> compiler).parseJsonConfigFileContent === 'function') {
        // parseConfigFile was renamed between 1.6.2 and 1.7
        configParseResult = (/*<TSCompatibleCompiler>*/ <any> compiler).parseJsonConfigFileContent(
            configFile.config,
            compiler.sys,
            path.dirname(configFilePath || '')
        );
    } else {
        configParseResult = (/*<TSCompatibleCompiler>*/ <any> compiler).parseConfigFile(
            configFile.config,
            compiler.sys,
            path.dirname(configFilePath || '')
        );
    }

    return configParseResult;
}
