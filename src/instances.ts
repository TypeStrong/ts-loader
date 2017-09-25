import * as typescript from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

import { makeAfterCompile } from './after-compile';
import { getConfigFile, getConfigParseResult } from './config';
import { getCompilerOptions, getCompiler } from './compilerSetup';
import { hasOwnProperty, makeError, formatErrors, registerWebpackErrors } from './utils';
import * as logger from './logger';
import { makeServicesHost } from './servicesHost';
import { makeWatchRun } from './watch-run';
import { 
    LoaderOptions,
    TSFiles,
    TSInstance,
    TSInstances,
    Webpack,
    WebpackError
} from './interfaces';

const instances = <TSInstances> {};

/**
 * The loader is executed once for each file seen by webpack. However, we need to keep
 * a persistent instance of TypeScript that contains all of the files in the program
 * along with definition files and options. This function either creates an instance
 * or returns the existing one. Multiple instances are possible by using the
 * `instance` property.
 */
export function getTypeScriptInstance(
    loaderOptions: LoaderOptions,
    loader: Webpack
): { instance?: TSInstance, error?: WebpackError } {
    if (hasOwnProperty(instances, loaderOptions.instance)) {
        return { instance: instances[loaderOptions.instance] };
    }

    const log = logger.makeLogger(loaderOptions);
    const compiler = getCompiler(loaderOptions, log);

    if (compiler.errorMessage !== undefined) {
        return { error: makeError({ rawMessage: compiler.errorMessage }) };
    }

    return successfulTypeScriptInstance(
        loaderOptions, loader, log, 
        compiler.compiler!, compiler.compilerCompatible!, compiler.compilerDetailsLogMessage!
    );
}

function successfulTypeScriptInstance(
    loaderOptions: LoaderOptions,
    loader: Webpack,
    log: logger.Logger,
    compiler: typeof typescript,
    compilerCompatible: boolean,
    compilerDetailsLogMessage: string
) {
    const configFileAndPath = getConfigFile(compiler, loader, loaderOptions, compilerCompatible, log, compilerDetailsLogMessage!);

    if (configFileAndPath.configFileError !== undefined) {
        return { error: configFileAndPath.configFileError };
    }

    const { configFilePath } = configFileAndPath;

    const configParseResult = getConfigParseResult(compiler, configFileAndPath.configFile, configFileAndPath.configFilePath!);

    if (configParseResult.errors.length > 0 && !loaderOptions.happyPackMode) {
        registerWebpackErrors(
            loader._module.errors,
            formatErrors(configParseResult.errors, loaderOptions, compiler, { file: configFilePath }));

        return { error: makeError({ rawMessage: 'error while parsing tsconfig.json', file: configFilePath }) };
    }

    const compilerOptions = getCompilerOptions(configParseResult);
    const files: TSFiles = {};

    const getCustomTransformers = loaderOptions.getCustomTransformers || Function.prototype;

    if (loaderOptions.transpileOnly) {
        // quick return for transpiling
        // we do need to check for any issues with TS options though
        const program = compiler!.createProgram([], compilerOptions);
        const diagnostics = program.getOptionsDiagnostics();

        // happypack does not have _module.errors - see https://github.com/TypeStrong/ts-loader/issues/336
        if (!loaderOptions.happyPackMode) {
            registerWebpackErrors(
                loader._module.errors,
                formatErrors(diagnostics, loaderOptions, compiler!, {file: configFilePath || 'tsconfig.json'}));
        }

        const instance = { compiler, compilerOptions, loaderOptions, files, dependencyGraph: {}, reverseDependencyGraph: {}, transformers: getCustomTransformers() };

        instances[loaderOptions.instance] = instance;

        return { instance };
    }

    // Load initial files (core lib files, any files specified in tsconfig.json)
    let normalizedFilePath: string;
    try {
        const filesToLoad = configParseResult.fileNames;
        filesToLoad.forEach(filePath => {
            normalizedFilePath = path.normalize(filePath);
            files[normalizedFilePath] = {
                text: fs.readFileSync(normalizedFilePath, 'utf-8'),
                version: 0
            };
          });
    } catch (exc) {
        return { error: makeError({
            rawMessage: `A file specified in tsconfig.json could not be found: ${ normalizedFilePath! }`
        }) };
    }

    // if allowJs is set then we should accept js(x) files
    const scriptRegex = configParseResult.options.allowJs && loaderOptions.entryFileIsJs
        ? /\.tsx?$|\.jsx?$/i
        : /\.tsx?$/i;

    const instance: TSInstance = instances[loaderOptions.instance] = {
        compiler,
        compilerOptions,
        loaderOptions,
        files,
        languageService: null,
        version: 0,
        transformers: getCustomTransformers(),
        dependencyGraph: {},
        reverseDependencyGraph: {},
        modifiedFiles: null,
    };

    const servicesHost = makeServicesHost(scriptRegex, log, loader, instance, loaderOptions.appendTsSuffixTo, loaderOptions.appendTsxSuffixTo);
    instance.languageService = compiler.createLanguageService(servicesHost, compiler.createDocumentRegistry());

    loader._compiler.plugin("after-compile", makeAfterCompile(instance, configFilePath));
    loader._compiler.plugin("watch-run", makeWatchRun(instance));

    return { instance };
}
