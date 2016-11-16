import path = require('path');
import loaderUtils = require('loader-utils');
import objectAssign = require('object-assign');
import arrify = require('arrify');
require('colors');

import instances = require('./instances');
import interfaces = require('./interfaces');
import utils = require('./utils');

let webpackInstances: any = [];
const definitionFileRegex = /\.d\.ts$/;

function loader(this: interfaces.Webpack, contents: string) {
    this.cacheable && this.cacheable();
    const callback = this.async();
    const options = makeOptions(this);
    const rawFilePath = path.normalize(this.resourcePath);
    const filePath = utils.appendTsSuffixIfMatch(options.appendTsSuffixTo, rawFilePath);

    const { instance, error } = instances.ensureTypeScriptInstance(options, this);

    if (error) {
        callback(error);
        return;
    }

    const file = updateFileInCache(filePath, contents, instance);

    let { outputText, sourceMapText } = options.transpileOnly
        ? getTranspilationEmit(filePath, contents, instance, this)
        : getEmit(filePath, instance, this);

    if (outputText === null || outputText === undefined) {
        throw new Error(`Typescript emitted no output for ${filePath}`);
    }

    const { sourceMap, output } = makeSourceMap(sourceMapText, outputText, filePath, contents, this);

    // Make sure webpack is aware that even though the emitted JavaScript may be the same as
    // a previously cached version the TypeScript may be different and therefore should be
    // treated as new
    this._module.meta.tsLoaderFileVersion = file.version;

    callback(null, output, sourceMap);
}

function makeOptions(loader: interfaces.Webpack) {
    const queryOptions = loaderUtils.parseQuery<interfaces.LoaderOptions>(loader.query);
    const configFileOptions = loader.options.ts || {};

    const options = objectAssign<interfaces.LoaderOptions>({}, {
        silent: false,
        logLevel: 'INFO',
        logInfoToStdOut: false,
        instance: 'default',
        compiler: 'typescript',
        configFileName: 'tsconfig.json',
        transpileOnly: false,
        visualStudioErrorFormat: false,
        compilerOptions: {},
        appendTsSuffixTo: [],
    }, configFileOptions, queryOptions);
    options.ignoreDiagnostics = arrify(options.ignoreDiagnostics).map(Number);
    options.logLevel = options.logLevel.toUpperCase();

    // differentiate the TypeScript instance based on the webpack instance
    let webpackIndex = webpackInstances.indexOf(loader._compiler);
    if (webpackIndex === -1) {
        webpackIndex = webpackInstances.push(loader._compiler) - 1;
    }
    options.instance = webpackIndex + '_' + options.instance;

    return options;
}

function updateFileInCache(filePath: string, contents: string, instance: interfaces.TSInstance) {
    // Update file contents
    let file = instance.files[filePath];
    if (!file) {
        file = instance.files[filePath] = <interfaces.TSFile> { version: 0 };
    }

    if (file.text !== contents) {
        file.version++;
        file.text = contents;
        instance.version++;
    }

    // push this file to modified files hash.
    if (!instance.modifiedFiles) {
        instance.modifiedFiles = {};
    }
    instance.modifiedFiles[filePath] = file;
    return file;
}

function getEmit(
    filePath: string,
    instance: interfaces.TSInstance,
    loader: interfaces.Webpack
) {
    // Emit Javascript
    const output = instance.languageService.getEmitOutput(filePath);

    // Make this file dependent on *all* definition files in the program
    loader.clearDependencies();
    loader.addDependency(filePath);

    const allDefinitionFiles = Object.keys(instance.files).filter(fp => definitionFileRegex.test(fp));
    allDefinitionFiles.forEach(loader.addDependency.bind(loader));

    // Additionally make this file dependent on all imported files
    let additionalDependencies = instance.dependencyGraph[filePath];
    if (additionalDependencies) {
        additionalDependencies.forEach(loader.addDependency.bind(loader));
    }

    loader._module.meta.tsLoaderDefinitionFileVersions = allDefinitionFiles
        .concat(additionalDependencies)
        .map(fp => fp + '@' + (instance.files[fp] || {version: '?'}).version);

    const outputFile = output.outputFiles.filter(f => !!f.name.match(/\.js(x?)$/)).pop();
    const outputText = (outputFile) ? outputFile.text : undefined;

    const sourceMapFile = output.outputFiles.filter(f => !!f.name.match(/\.js(x?)\.map$/)).pop();
    const sourceMapText = (sourceMapFile) ? sourceMapFile.text : undefined;

    return { outputText, sourceMapText };
}

function getTranspilationEmit(
    filePath: string,
    contents: string,
    instance: interfaces.TSInstance,
    loader: interfaces.Webpack
) {
    const fileName = path.basename(filePath);
    const transpileResult = instance.compiler.transpileModule(contents, {
        compilerOptions: instance.compilerOptions,
        reportDiagnostics: true,
        fileName,
    });

    const { outputText, sourceMapText, diagnostics } = transpileResult;

    utils.registerWebpackErrors(loader._module.errors, utils.formatErrors(diagnostics, instance.loaderOptions, instance.compiler, {module: loader._module}));

    return { outputText, sourceMapText };
}

function makeSourceMap(
    sourceMapText: string,
    outputText: string,
    filePath: string,
    contents: string,
    loader: interfaces.Webpack
) {
    if (!sourceMapText) {
        return { output: outputText, sourceMap: undefined as interfaces.SourceMap };
    }

    const sourceMap = JSON.parse(sourceMapText);
    sourceMap.sources = [loaderUtils.getRemainingRequest(loader)];
    sourceMap.file = filePath;
    sourceMap.sourcesContent = [contents];

    return {
        output: outputText.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, ''),
        sourceMap
    };
}

export = loader;
