import * as path from 'path';
import * as loaderUtils from 'loader-utils';

import { getTypeScriptInstance } from './instances';
import { appendSuffixesIfMatch, arrify, formatErrors, hasOwnProperty, registerWebpackErrors } from './utils';
import * as constants from './constants';
import {
    AsyncCallback,
    Compiler,
    LoaderOptions,
    LoaderOptionsCache,
    TSFile,
    TSInstance,
    Webpack,
    LogLevel
} from './interfaces';

const webpackInstances: Compiler[] = [];
const loaderOptionsCache: LoaderOptionsCache = {};

type PartialLoaderOptions = Partial<LoaderOptions>;

/**
 * The entry point for ts-loader
 */
function loader(this: Webpack, contents: string) {
    this.cacheable && this.cacheable();
    const callback = this.async();
    const options = getLoaderOptions(this);
    const instanceOrError = getTypeScriptInstance(options, this);

    if (instanceOrError.error !== undefined) {
        callback(instanceOrError.error);
        return;
    }

    return successLoader(this, contents, callback, options, instanceOrError.instance!);
}

function successLoader(
    loader: Webpack,
    contents: string,
    callback: AsyncCallback,
    options: LoaderOptions,
    instance: TSInstance
) {

    const rawFilePath = path.normalize(loader.resourcePath);

    const filePath = options.appendTsSuffixTo.length > 0 || options.appendTsxSuffixTo.length > 0
        ? appendSuffixesIfMatch({
            '.ts': options.appendTsSuffixTo,
            '.tsx': options.appendTsxSuffixTo,
        }, rawFilePath)
        : rawFilePath;

    const fileVersion = updateFileInCache(filePath, contents, instance);

    const { outputText, sourceMapText } = options.transpileOnly
        ? getTranspilationEmit(filePath, contents, instance, loader)
        : getEmit(rawFilePath, filePath, instance, loader);

    if (outputText === null || outputText === undefined) {
        const additionalGuidance = filePath.indexOf('node_modules') !== -1
            ? '\nYou should not need to recompile .ts files in node_modules.\nPlease contact the package author to advise them to use --declaration --outDir.\nMore https://github.com/Microsoft/TypeScript/issues/12358'
            : '';
        throw new Error(`Typescript emitted no output for ${filePath}.${additionalGuidance}`);
    }

    const { sourceMap, output } = makeSourceMap(sourceMapText, outputText, filePath, contents, loader);

    // _module.meta is not available inside happypack
    if (!options.happyPackMode) {
        // Make sure webpack is aware that even though the emitted JavaScript may be the same as
        // a previously cached version the TypeScript may be different and therefore should be
        // treated as new
        loader._module.meta.tsLoaderFileVersion = fileVersion;
    }

    callback(null, output, sourceMap);
}

/**
 * either retrieves loader options from the cache
 * or creates them, adds them to the cache and returns
 */
function getLoaderOptions(loader: Webpack) {
    // differentiate the TypeScript instance based on the webpack instance
    let webpackIndex = webpackInstances.indexOf(loader._compiler);
    if (webpackIndex === -1) {
        webpackIndex = webpackInstances.push(loader._compiler) - 1;
    }

    const loaderOptions = loaderUtils.getOptions<LoaderOptions>(loader) || {} as LoaderOptions;
    const configFileOptions: PartialLoaderOptions = loader.options.ts || {};

    const instanceName = webpackIndex + '_' + (loaderOptions.instance || configFileOptions.instance || 'default');

    if (hasOwnProperty(loaderOptionsCache, instanceName)) {
        return loaderOptionsCache[instanceName];
    }

    validateLoaderOptions(loaderOptions);

    const options = makeLoaderOptions(instanceName, configFileOptions, loaderOptions);

    loaderOptionsCache[instanceName] = options;

    return options;
}

type ValidLoaderOptions = keyof LoaderOptions;
const validLoaderOptions: ValidLoaderOptions[] = ['silent', 'logLevel', 'logInfoToStdOut', 'instance', 'compiler', 'configFile', 'transpileOnly', 'ignoreDiagnostics', 'errorFormatter', 'colors', 'compilerOptions', 'appendTsSuffixTo', 'appendTsxSuffixTo', 'entryFileCannotBeJs' /* DEPRECATED */, 'onlyCompileBundledFiles', 'happyPackMode', 'getCustomTransformers'];

/**
 * Validate the supplied loader options.
 * At present this validates the option names only; in future we may look at validating the values too
 * @param loaderOptions 
 */
function validateLoaderOptions(loaderOptions: LoaderOptions) {
    const loaderOptionKeys = Object.keys(loaderOptions);
    for (let i = 0; i < loaderOptionKeys.length; i++) {
        const option = loaderOptionKeys[i];
        const isUnexpectedOption = (validLoaderOptions as string[]).indexOf(option) === -1;
        if (isUnexpectedOption) {
            throw new Error(`ts-loader was supplied with an unexpected loader option: ${option}

Please take a look at the options you are supplying; the following are valid options:
${ validLoaderOptions.join(' / ')}
`);
        }
    }
}

function makeLoaderOptions(instanceName: string, configFileOptions: Partial<LoaderOptions>, loaderOptions: LoaderOptions) {
    const options = Object.assign({}, {
        silent: false,
        logLevel: 'WARN',
        logInfoToStdOut: false,
        compiler: 'typescript',
        configFile: 'tsconfig.json',
        contextAsConfigBasePath: false,
        transpileOnly: false,
        compilerOptions: {},
        appendTsSuffixTo: [],
        appendTsxSuffixTo: [],
        transformers: {},
        entryFileCannotBeJs: false,
        happyPackMode: false,
        colors: true,
        onlyCompileBundledFiles: false
    } as Partial<LoaderOptions>, configFileOptions, loaderOptions);

    options.ignoreDiagnostics = arrify(options.ignoreDiagnostics).map(Number);
    options.logLevel = options.logLevel.toUpperCase() as LogLevel;
    options.instance = instanceName;

    // happypack can be used only together with transpileOnly mode
    options.transpileOnly = options.happyPackMode ? true : options.transpileOnly;

    return options;
}

/**
 * Either add file to the overall files cache or update it in the cache when the file contents have changed
 * Also add the file to the modified files
 */
function updateFileInCache(filePath: string, contents: string, instance: TSInstance) {
    // Update file contents
    let file = instance.files[filePath];
    if (file === undefined) {
        file = instance.files[filePath] = <TSFile>{ version: 0 };
    }

    if (file.text !== contents) {
        file.version++;
        file.text = contents;
        instance.version!++;
    }

    // push this file to modified files hash.
    if (!instance.modifiedFiles) {
        instance.modifiedFiles = {};
    }
    instance.modifiedFiles[filePath] = file;
    return file.version;
}

function getEmit(
    rawFilePath: string,
    filePath: string,
    instance: TSInstance,
    loader: Webpack
) {
    // Emit Javascript
    const output = instance.languageService!.getEmitOutput(filePath);

    loader.clearDependencies();
    loader.addDependency(rawFilePath);

    const allDefinitionFiles = Object.keys(instance.files).filter(defFilePath => defFilePath.match(constants.dtsDtsxRegex));

    // Make this file dependent on *all* definition files in the program
    const addDependency = loader.addDependency.bind(loader);
    allDefinitionFiles.forEach(addDependency);

    // Additionally make this file dependent on all imported files
    const fileDependencies = instance.dependencyGraph[filePath];
    const additionalDependencies = fileDependencies === undefined
        ? []
        : fileDependencies.map(module => module.originalFileName);
    if (additionalDependencies) {
        additionalDependencies.forEach(addDependency);
    }

    loader._module.meta.tsLoaderDefinitionFileVersions = allDefinitionFiles
        .concat(additionalDependencies)
        .map(defFilePath => defFilePath + '@' + (instance.files[defFilePath] || { version: '?' }).version);

    const outputFile = output.outputFiles.filter(outputFile => outputFile.name.match(constants.jsJsx)).pop();
    const outputText = (outputFile) ? outputFile.text : undefined;

    const sourceMapFile = output.outputFiles.filter(outputFile => outputFile.name.match(constants.jsJsxMap)).pop();
    const sourceMapText = (sourceMapFile) ? sourceMapFile.text : undefined;

    return { outputText, sourceMapText };
}

/**
 * Transpile file
 */
function getTranspilationEmit(
    filePath: string,
    contents: string,
    instance: TSInstance,
    loader: Webpack
) {
    const fileName = path.basename(filePath);

    const { outputText, sourceMapText, diagnostics } = instance.compiler.transpileModule(contents, {
        compilerOptions: { ...instance.compilerOptions, rootDir: undefined },
        transformers: instance.transformers,
        reportDiagnostics: true,
        fileName,
    });

    // _module.errors is not available inside happypack - see https://github.com/TypeStrong/ts-loader/issues/336
    if (!instance.loaderOptions.happyPackMode) {
        registerWebpackErrors(
            loader._module.errors,
            formatErrors(diagnostics, instance.loaderOptions, instance.colors, instance.compiler, { module: loader._module })
        );
    }

    return { outputText, sourceMapText };
}

function makeSourceMap(
    sourceMapText: string | undefined,
    outputText: string,
    filePath: string,
    contents: string,
    loader: Webpack
) {
    if (sourceMapText === undefined) {
        return { output: outputText, sourceMap: undefined };
    }

    return {
        output: outputText.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, ''),
        sourceMap: Object.assign(JSON.parse(sourceMapText), {
            sources: [loaderUtils.getRemainingRequest(loader)],
            file: filePath,
            sourcesContent: [contents]
        })
    };
}

export = loader;
