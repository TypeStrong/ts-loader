import typescript = require('typescript');
import path = require('path');

import interfaces = require('./interfaces');
import logger = require('./logger');
import utils = require('./utils');

interface ConfigFile {
    config?: any;
    error?: typescript.Diagnostic;
}

export function getConfigFile(
    compiler: typeof typescript,
    loader: interfaces.Webpack,
    loaderOptions: interfaces.LoaderOptions,
    compilerCompatible: boolean,
    log: logger.Logger,
    compilerDetailsLogMessage: string
) {
    const configFilePath = findConfigFile(compiler, path.dirname(loader.resourcePath), loaderOptions.configFileName);
    let configFileError: interfaces.WebpackError;
    let configFile: ConfigFile;

    if (configFilePath) {
        if (compilerCompatible) {
            log.logInfo(`${compilerDetailsLogMessage} and ${configFilePath}`.green);
        } else {
            log.logInfo(`ts-loader: Using config file at ${configFilePath}`.green);
        }

        // HACK: relies on the fact that passing an extra argument won't break
        // the old API that has a single parameter
        configFile = (<interfaces.TSCompatibleCompiler> <any> compiler).readConfigFile(
            configFilePath,
            compiler.sys.readFile
        );

        if (configFile.error) {
            configFileError = utils.formatErrors([configFile.error], loaderOptions, compiler, { file: configFilePath })[0];
        }
    } else {
        if (compilerCompatible) { log.logInfo(compilerDetailsLogMessage.green); }

        configFile = {
            config: {
                compilerOptions: {},
                files: [],
            },
        };
    }

    if (!configFileError) {
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
 * The tsconfig.json is found using the same method as `tsc`, starting in the current directory
 * and continuing up the parent directory chain.
 */
function findConfigFile(compiler: typeof typescript, searchPath: string, configFileName: string): string {
    while (true) {
        const fileName = path.join(searchPath, configFileName);
        if (compiler.sys.fileExists(fileName)) {
            return fileName;
        }
        const parentPath = path.dirname(searchPath);
        if (parentPath === searchPath) {
            break;
        }
        searchPath = parentPath;
    }
    return undefined;
}

export function getConfigParseResult(
    compiler: typeof typescript,
    configFile: ConfigFile,
    configFilePath: string
) {
    let configParseResult: typescript.ParsedCommandLine;
    if (typeof (<any> compiler).parseJsonConfigFileContent === 'function') {
        // parseConfigFile was renamed between 1.6.2 and 1.7
        configParseResult = (<interfaces.TSCompatibleCompiler> <any> compiler).parseJsonConfigFileContent(
            configFile.config,
            compiler.sys,
            path.dirname(configFilePath || '')
        );
    } else {
        configParseResult = (<interfaces.TSCompatibleCompiler> <any> compiler).parseConfigFile(
            configFile.config,
            compiler.sys,
            path.dirname(configFilePath || '')
        );
    }

    return configParseResult;
}
