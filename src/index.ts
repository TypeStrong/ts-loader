import typescript = require('typescript');
import path = require('path');
import fs = require('fs');
import loaderUtils = require('loader-utils');
import objectAssign = require('object-assign');
import arrify = require('arrify');
require('colors');

import afterCompile = require('./after-compile');
import config = require('./config');
import compilerSetup = require('./compilerSetup');
import interfaces = require('./interfaces');
import utils = require('./utils');
import logger = require('./logger');
import makeServicesHost = require('./servicesHost');
import watchRun = require('./watch-run');

let instances = <interfaces.TSInstances> {};
let webpackInstances: any = [];

/**
 * The loader is executed once for each file seen by webpack. However, we need to keep
 * a persistent instance of TypeScript that contains all of the files in the program
 * along with definition files and options. This function either creates an instance
 * or returns the existing one. Multiple instances are possible by using the
 * `instance` property.
 */
function ensureTypeScriptInstance(loaderOptions: interfaces.LoaderOptions, loader: any): { instance?: interfaces.TSInstance, error?: interfaces.WebpackError } {
    if (utils.hasOwnProperty(instances, loaderOptions.instance)) {
        return { instance: instances[loaderOptions.instance] };
    }

    const log = logger.makeLogger(loaderOptions);
    const { compiler, compilerCompatible, compilerDetailsLogMessage, errorMessage } = compilerSetup.getCompiler(loaderOptions, log);

    if (errorMessage) {
        return { error: utils.makeError({ rawMessage: errorMessage }) };
    }

    const files: interfaces.TSFiles = {};
    const instance: interfaces.TSInstance = instances[loaderOptions.instance] = {
        compiler,
        compilerOptions: null,
        loaderOptions,
        files,
        languageService: null,
        version: 0,
        dependencyGraph: {},
        reverseDependencyGraph: {},
        modifiedFiles: null,
    };

    const {
        configFilePath,
        configFile,
        configFileError
    } = config.getConfigFile(compiler, loader, loaderOptions, compilerCompatible, log, compilerDetailsLogMessage, instance);

    if (configFileError) {
        return { error: configFileError };
    }

    const configParseResult = config.getConfigParseResult(compiler, configFile, configFilePath);

    if (configParseResult.errors.length) {
        utils.registerWebpackErrors(
            loader._module.errors,
            utils.formatErrors(configParseResult.errors, instance, { file: configFilePath }));

        return { error: utils.makeError({ rawMessage: 'error while parsing tsconfig.json', file: configFilePath }) };
    }

    const compilerOptions = compilerSetup.getCompilerOptions(compilerCompatible, compiler, configParseResult);
    instance.compilerOptions = compilerOptions;

    if (loaderOptions.transpileOnly) {
        // quick return for transpiling
        // we do need to check for any issues with TS options though
        const program = compiler.createProgram([], compilerOptions);
        const diagnostics = program.getOptionsDiagnostics();

        utils.registerWebpackErrors(
            loader._module.errors,
            utils.formatErrors(diagnostics, instance, {file: configFilePath || 'tsconfig.json'}));

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

    const servicesHost = makeServicesHost(files, scriptRegex, log, loader, compilerOptions, instance, compiler);

    loader._compiler.plugin("after-compile", afterCompile(instance, compiler, servicesHost, configFilePath));
    loader._compiler.plugin("watch-run", watchRun(instance));

    return { instance };
}

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

    const { instance, error } = ensureTypeScriptInstance(options, this);

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
