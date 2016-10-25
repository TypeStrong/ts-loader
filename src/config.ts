import objectAssign = require('object-assign');
import typescript = require('typescript');
import path = require('path');

import interfaces = require('./interfaces');
import logger = require('./logger');
import utils = require('./utils');

interface ConfigFile {
    config?: any;
    error?: typescript.Diagnostic;
}

function getConfigFile(
    compiler: typeof typescript,
    loader: any,
    loaderOptions: interfaces.LoaderOptions,
    compilerCompatible: boolean,
    log: logger.Logger,
    compilerDetailsLogMessage: string,
    instance: interfaces.TSInstance
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
        configFile = (<interfaces.TSCompatibleCompiler><any>compiler).readConfigFile(
            configFilePath,
            compiler.sys.readFile
        );

        if (configFile.error) {
            configFileError = utils.formatErrors([configFile.error], instance, { file: configFilePath })[0];
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
        configFile.config.compilerOptions = objectAssign({},
            configFile.config.compilerOptions,
            loaderOptions.compilerOptions);

        // do any necessary config massaging
        if (loaderOptions.transpileOnly) {
            configFile.config.compilerOptions.isolatedModules = true;
        }
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

export = getConfigFile;