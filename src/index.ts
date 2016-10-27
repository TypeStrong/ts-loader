import typescript = require('typescript');
import path = require('path');
import loaderUtils = require('loader-utils');
import objectAssign = require('object-assign');
import arrify = require('arrify');
require('colors');

import instances = require('./instances');
import interfaces = require('./interfaces');
import utils = require('./utils');

let webpackInstances: any = [];

function loader(contents: string) {
    this.cacheable && this.cacheable();
    const callback = this.async();
    const filePath = path.normalize(this.resourcePath);

    const queryOptions = loaderUtils.parseQuery<interfaces.LoaderOptions>(this.query);
    const configFileOptions = this.options.ts || {};

    const options = objectAssign<interfaces.LoaderOptions>({}, {
        silent: false,
        logLevel: 'INFO',
        logInfoToStdOut: false,
        instance: 'default',
        compiler: 'typescript',
        configFileName: 'tsconfig.json',
        transpileOnly: false,
        compilerOptions: {},
    }, configFileOptions, queryOptions);
    options.ignoreDiagnostics = arrify(options.ignoreDiagnostics).map(Number);
    options.logLevel = options.logLevel.toUpperCase();

    // differentiate the TypeScript instance based on the webpack instance
    let webpackIndex = webpackInstances.indexOf(this._compiler);
    if (webpackIndex === -1) {
        webpackIndex = webpackInstances.push(this._compiler) - 1;
    }
    options.instance = webpackIndex + '_' + options.instance;

    const { instance, error } = instances.ensureTypeScriptInstance(options, this);

    if (error) {
        callback(error);
        return;
    }

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

    let outputText: string;
    let sourceMapText: string;
    let diagnostics: typescript.Diagnostic[] = [];

    if (options.transpileOnly) {
        const fileName = path.basename(filePath);
        const transpileResult = instance.compiler.transpileModule(contents, {
            compilerOptions: instance.compilerOptions,
            reportDiagnostics: true,
            fileName,
        });

        ({ outputText, sourceMapText, diagnostics } = transpileResult);

        utils.registerWebpackErrors(this._module.errors, utils.formatErrors(diagnostics, instance, {module: this._module}));
    } else {
        let langService = instance.languageService;

        // Emit Javascript
        const output = langService.getEmitOutput(filePath);

        // Make this file dependent on *all* definition files in the program
        this.clearDependencies();
        this.addDependency(filePath);

        let allDefinitionFiles = Object.keys(instance.files).filter(fp => /\.d\.ts$/.test(fp));
        allDefinitionFiles.forEach(this.addDependency.bind(this));

        // Additionally make this file dependent on all imported files
        let additionalDependencies = instance.dependencyGraph[filePath];
        if (additionalDependencies) {
            additionalDependencies.forEach(this.addDependency.bind(this));
        }

        this._module.meta.tsLoaderDefinitionFileVersions = allDefinitionFiles
            .concat(additionalDependencies)
            .map(fp => fp + '@' + (instance.files[fp] || {version: '?'}).version);

        const outputFile = output.outputFiles.filter(f => !!f.name.match(/\.js(x?)$/)).pop();
        if (outputFile) { outputText = outputFile.text; }

        const sourceMapFile = output.outputFiles.filter(f => !!f.name.match(/\.js(x?)\.map$/)).pop();
        if (sourceMapFile) { sourceMapText = sourceMapFile.text; }
    }

    if (outputText === null || outputText === undefined) {
        throw new Error(`Typescript emitted no output for ${filePath}`);
    }

    let sourceMap: { sources: any[], file: string; sourcesContent: string[] };
    if (sourceMapText) {
        sourceMap = JSON.parse(sourceMapText);
        sourceMap.sources = [loaderUtils.getRemainingRequest(this)];
        sourceMap.file = filePath;
        sourceMap.sourcesContent = [contents];
        outputText = outputText.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '');
    }

    // Make sure webpack is aware that even though the emitted JavaScript may be the same as
    // a previously cached version the TypeScript may be different and therefore should be
    // treated as new
    this._module.meta.tsLoaderFileVersion = file.version;

    callback(null, outputText, sourceMap);
}

export = loader;
