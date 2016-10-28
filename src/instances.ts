import path = require('path');
import fs = require('fs');
require('colors');

import afterCompile = require('./after-compile');
import config = require('./config');
import compilerSetup = require('./compilerSetup');
import interfaces = require('./interfaces');
import utils = require('./utils');
import logger = require('./logger');
import makeServicesHost = require('./servicesHost');
import watchRun = require('./watch-run');

const instances = <interfaces.TSInstances> {};

/**
 * The loader is executed once for each file seen by webpack. However, we need to keep
 * a persistent instance of TypeScript that contains all of the files in the program
 * along with definition files and options. This function either creates an instance
 * or returns the existing one. Multiple instances are possible by using the
 * `instance` property.
 */
export function ensureTypeScriptInstance(loaderOptions: interfaces.LoaderOptions, loader: any): { instance?: interfaces.TSInstance, error?: interfaces.WebpackError } {
    if (utils.hasOwnProperty(instances, loaderOptions.instance)) {
        return { instance: instances[loaderOptions.instance] };
    }

    const log = logger.makeLogger(loaderOptions);
    const { compiler, compilerCompatible, compilerDetailsLogMessage, errorMessage } = compilerSetup.getCompiler(loaderOptions, log);

    if (errorMessage) {
        return { error: utils.makeError({ rawMessage: errorMessage }) };
    }

    const {
        configFilePath,
        configFile,
        configFileError
    } = config.getConfigFile(compiler, loader, loaderOptions, compilerCompatible, log, compilerDetailsLogMessage);

    if (configFileError) {
        return { error: configFileError };
    }

    const configParseResult = config.getConfigParseResult(compiler, configFile, configFilePath);

    if (configParseResult.errors.length) {
        utils.registerWebpackErrors(
            loader._module.errors,
            utils.formatErrors(configParseResult.errors, loaderOptions, compiler, { file: configFilePath }));

        return { error: utils.makeError({ rawMessage: 'error while parsing tsconfig.json', file: configFilePath }) };
    }

    const compilerOptions = compilerSetup.getCompilerOptions(compilerCompatible, compiler, configParseResult);
    const files: interfaces.TSFiles = {};

    if (loaderOptions.transpileOnly) {
        // quick return for transpiling
        // we do need to check for any issues with TS options though
        const program = compiler.createProgram([], compilerOptions);
        const diagnostics = program.getOptionsDiagnostics();

        utils.registerWebpackErrors(
            loader._module.errors,
            utils.formatErrors(diagnostics, loaderOptions, compiler, {file: configFilePath || 'tsconfig.json'}));

        return { instance: instances[loaderOptions.instance] = { compiler, compilerOptions, loaderOptions, files, dependencyGraph: {}, reverseDependencyGraph: {} }};
    }

    // Load initial files (core lib files, any files specified in tsconfig.json)
    let filePath: string;
    try {
        const filesToLoad = configParseResult.fileNames;
        filesToLoad.forEach(fp => {
            filePath = path.normalize(fp);
            files[filePath] = {
                text: fs.readFileSync(filePath, 'utf-8'),
                version: 0
            };
          });
    } catch (exc) {
        return { error: utils.makeError({
            rawMessage: `A file specified in tsconfig.json could not be found: ${ filePath }`
        }) };
    }

    // if allowJs is set then we should accept js(x) files
    const scriptRegex = configFile.config.compilerOptions.allowJs
        ? /\.tsx?$|\.jsx?$/i
        : /\.tsx?$/i;

    const instance: interfaces.TSInstance = instances[loaderOptions.instance] = {
        compiler,
        compilerOptions,
        loaderOptions,
        files,
        languageService: null,
        version: 0,
        dependencyGraph: {},
        reverseDependencyGraph: {},
        modifiedFiles: null,
    };

    const servicesHost = makeServicesHost(scriptRegex, log, loader, instance);
    instance.languageService = compiler.createLanguageService(servicesHost, compiler.createDocumentRegistry());

    loader._compiler.plugin("after-compile", afterCompile(instance, configFilePath));
    loader._compiler.plugin("watch-run", watchRun(instance));

    return { instance };
}
