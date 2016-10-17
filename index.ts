///<reference path="typings/node/node.d.ts" />
///<reference path="typings/loaderUtils/loaderUtils.d.ts" />
///<reference path="typings/objectAssign/objectAssign.d.ts" />
///<reference path="typings/colors/colors.d.ts" />
///<reference path="typings/arrify/arrify.d.ts" />
import typescript = require('typescript');
import path = require('path');
import fs = require('fs');
import os = require('os');
import loaderUtils = require('loader-utils');
import objectAssign = require('object-assign');
import arrify = require('arrify');
import makeResolver = require('./resolver');
var Console = require('console').Console;
var semver = require('semver')
require('colors');

const stderrConsole = new Console(process.stderr);
const stdoutConsole = new Console(process.stdout);

var pushArray = function(arr, toPush) {
    Array.prototype.splice.apply(arr, [0, 0].concat(toPush));
}

function hasOwnProperty(obj, property) {
    return Object.prototype.hasOwnProperty.call(obj, property)
}

enum LogLevel {
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

interface LoaderOptions {
    silent: boolean;
    logLevel: string;
    logInfoToStdOut: boolean;
    instance: string;
    compiler: string;
    configFileName: string;
    transpileOnly: boolean;
    ignoreDiagnostics: number[];
    compilerOptions: typescript.CompilerOptions;
}

interface TSFile {
    text: string;
    version: number;
}

interface TSFiles {
    [fileName: string]: TSFile;
}

interface TSInstance {
    compiler: typeof typescript;
    compilerOptions: typescript.CompilerOptions;
    loaderOptions: LoaderOptions;
    files: TSFiles;
    languageService?: typescript.LanguageService;
    version?: number;
    dependencyGraph: any;
}

interface TSInstances {
    [name: string]: TSInstance;
}

interface WebpackError {
    module?: any;
    file?: string;
    message: string;
    rawMessage: string;
    location?: {line: number, character: number};
    loaderSource: string;
}

interface ResolvedModule {
    resolvedFileName?: string;
    resolvedModule?: ResolvedModule;
    isExternalLibraryImport?: boolean;
}

interface TSCompatibleCompiler {
    // typescript@next 1.7+
    readConfigFile(fileName: string, readFile: (path: string) => string): {
        config?: any;
        error?: typescript.Diagnostic;
    };
    // typescript@latest 1.6.2
    readConfigFile(fileName: string): {
        config?: any;
        error?: typescript.Diagnostic;
    };
    // typescript@next 1.8+
    parseJsonConfigFileContent?(json: any, host: typescript.ParseConfigHost, basePath: string): typescript.ParsedCommandLine;
    // typescript@latest 1.6.2
    parseConfigFile?(json: any, host: typescript.ParseConfigHost, basePath: string): typescript.ParsedCommandLine;
}

var instances = <TSInstances>{};
var webpackInstances = [];
let scriptRegex = /\.tsx?$/i;

// Take TypeScript errors, parse them and format to webpack errors
// Optionally adds a file name
function formatErrors(diagnostics: typescript.Diagnostic[], instance: TSInstance, merge?: any): WebpackError[] {
    return diagnostics
        .filter(diagnostic => instance.loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) == -1)
        .map<WebpackError>(diagnostic => {
            var errorCategory = instance.compiler.DiagnosticCategory[diagnostic.category].toLowerCase();
            var errorCategoryAndCode = errorCategory + ' TS' + diagnostic.code + ': ';

            var messageText = errorCategoryAndCode + instance.compiler.flattenDiagnosticMessageText(diagnostic.messageText, os.EOL);
            if (diagnostic.file) {
                var lineChar = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                return {
                    message: `${'('.white}${(lineChar.line+1).toString().cyan},${(lineChar.character+1).toString().cyan}): ${messageText.red}`,
                    rawMessage: messageText,
                    location: {line: lineChar.line+1, character: lineChar.character+1},
                    loaderSource: 'ts-loader'
                };
            }
            else {
                return {
                    message:`${messageText.red}`,
                    rawMessage: messageText,
                    loaderSource: 'ts-loader'
                };
            }
        })
        .map(error => <WebpackError>objectAssign(error, merge));
}

// The tsconfig.json is found using the same method as `tsc`, starting in the current directory
// and continuing up the parent directory chain.
function findConfigFile(compiler: typeof typescript, searchPath: string, configFileName: string): string {
    while (true) {
        var fileName = path.join(searchPath, configFileName);
        if (compiler.sys.fileExists(fileName)) {
            return fileName;
        }
        var parentPath = path.dirname(searchPath);
        if (parentPath === searchPath) {
            break;
        }
        searchPath = parentPath;
    }
    return undefined;
}

// The loader is executed once for each file seen by webpack. However, we need to keep
// a persistent instance of TypeScript that contains all of the files in the program
// along with definition files and options. This function either creates an instance
// or returns the existing one. Multiple instances are possible by using the
// `instance` property.
function ensureTypeScriptInstance(loaderOptions: LoaderOptions, loader: any): { instance?: TSInstance, error?: WebpackError } {
    function log(...messages: string[]): void {
        logToConsole(loaderOptions.logInfoToStdOut ? stdoutConsole : stderrConsole, messages);
    }

    function logToConsole(logConsole:any, messages: string[]): void {
        if (!loaderOptions.silent) {
            console.log.apply(logConsole, messages);
        }
    }

    function logInfo(...messages: string[]): void {
        if (LogLevel[loaderOptions.logLevel] <= LogLevel.INFO) {
            logToConsole(loaderOptions.logInfoToStdOut ? stdoutConsole : stderrConsole, messages);
        }
    }

    function logError(...messages: string[]): void {
        if (LogLevel[loaderOptions.logLevel] <= LogLevel.ERROR) {
            logToConsole(stderrConsole, messages);
        }
    }

    function logWarning(...messages: string[]): void {
        if (LogLevel[loaderOptions.logLevel] <= LogLevel.WARN) {
            logToConsole(stderrConsole, messages);
        }
    }

    if (hasOwnProperty(instances, loaderOptions.instance)) {
        return { instance: instances[loaderOptions.instance] };
    }

    try {
        var compiler: typeof typescript = require(loaderOptions.compiler);
    }
    catch (e) {
        let message = loaderOptions.compiler == 'typescript'
            ? 'Could not load TypeScript. Try installing with `npm install typescript`. If TypeScript is installed globally, try using `npm link typescript`.'
            : `Could not load TypeScript compiler with NPM package name \`${loaderOptions.compiler}\`. Are you sure it is correctly installed?`
        return { error: {
            message: message.red,
            rawMessage: message,
            loaderSource: 'ts-loader'
        } };
    }

    var motd = `ts-loader: Using ${loaderOptions.compiler}@${compiler.version}`,
        compilerCompatible = false;
    if (loaderOptions.compiler == 'typescript') {
        if (compiler.version && semver.gte(compiler.version, '1.6.2-0')) {
            // don't log yet in this case, if a tsconfig.json exists we want to combine the message
            compilerCompatible = true;
        }
        else {
            logError(`${motd}. This version is incompatible with ts-loader. Please upgrade to the latest version of TypeScript.`.red);
        }
    }
    else {
        logWarning(`${motd}. This version may or may not be compatible with ts-loader.`.yellow);
    }

    var files = <TSFiles>{};
    var instance: TSInstance = instances[loaderOptions.instance] = {
        compiler,
        compilerOptions: null,
        loaderOptions,
        files,
        languageService: null,
        version: 0,
        dependencyGraph: {}
    };

    var compilerOptions: typescript.CompilerOptions = {
        skipDefaultLibCheck: true,
        suppressOutputPathCheck: true // This is why: https://github.com/Microsoft/TypeScript/issues/7363
    };

    // Load any available tsconfig.json file
    var filesToLoad = [];
    var configFilePath = findConfigFile(compiler, path.dirname(loader.resourcePath), loaderOptions.configFileName);
    var configFile: {
        config?: any;
        error?: typescript.Diagnostic;
    };
    if (configFilePath) {
        if (compilerCompatible) logInfo(`${motd} and ${configFilePath}`.green)
        else logInfo(`ts-loader: Using config file at ${configFilePath}`.green)

        // HACK: relies on the fact that passing an extra argument won't break
        // the old API that has a single parameter
        configFile = (<TSCompatibleCompiler><any>compiler).readConfigFile(
            configFilePath,
            compiler.sys.readFile
        );

        if (configFile.error) {
            var configFileError = formatErrors([configFile.error], instance, {file: configFilePath })[0];
            return { error: configFileError }
        }
    }
    else {
        if (compilerCompatible) logInfo(motd.green)

        configFile = {
            config: {
                compilerOptions: {},
                files: []
            }
        }
    }

    configFile.config.compilerOptions = objectAssign({},
        configFile.config.compilerOptions,
        loaderOptions.compilerOptions);

    // do any necessary config massaging
    if (loaderOptions.transpileOnly) {
        configFile.config.compilerOptions.isolatedModules = true;
    }

    // if allowJs is set then we should accept js(x) files
    if (configFile.config.compilerOptions.allowJs) {
        scriptRegex = /\.tsx?$|\.jsx?$/i;
    }

    var configParseResult;
    if (typeof (<any>compiler).parseJsonConfigFileContent === 'function') {
        // parseConfigFile was renamed between 1.6.2 and 1.7
        configParseResult = (<TSCompatibleCompiler><any>compiler).parseJsonConfigFileContent(
            configFile.config,
            compiler.sys,
            path.dirname(configFilePath || '')
        );
    } else {
        configParseResult = (<TSCompatibleCompiler><any>compiler).parseConfigFile(
            configFile.config,
            compiler.sys,
            path.dirname(configFilePath || '')
        );
    }

    if (configParseResult.errors.length) {
        pushArray(
            loader._module.errors,
            formatErrors(configParseResult.errors, instance, { file: configFilePath }));

        return { error: {
            file: configFilePath,
            message: 'error while parsing tsconfig.json'.red,
            rawMessage: 'error while parsing tsconfig.json',
            loaderSource: 'ts-loader'
        }};
    }

    instance.compilerOptions = objectAssign<typescript.CompilerOptions>(compilerOptions, configParseResult.options);
    filesToLoad = configParseResult.fileNames;

    // if `module` is not specified and not using ES6 target, default to CJS module output
    if (compilerOptions.module == null && compilerOptions.target !== 2 /* ES6 */) {
        compilerOptions.module = 1 /* CommonJS */
    }
    // special handling for TS 1.6 and target: es6
    else if (compilerCompatible && semver.lt(compiler.version, '1.7.3-0') && compilerOptions.target == 2 /* ES6 */) {
        compilerOptions.module = 0 /* None */;
    }

    if (loaderOptions.transpileOnly) {
        // quick return for transpiling
        // we do need to check for any issues with TS options though
        var program = compiler.createProgram([], compilerOptions),
            diagnostics = program.getOptionsDiagnostics();

        pushArray(
            loader._module.errors,
            formatErrors(diagnostics, instance, {file: configFilePath || 'tsconfig.json'}));

        return { instance: instances[loaderOptions.instance] = { compiler, compilerOptions, loaderOptions, files, dependencyGraph: {} }};
    }

    // Load initial files (core lib files, any files specified in tsconfig.json)
    let filePath: string;
    try {
        filesToLoad.forEach(fp => {
            filePath = path.normalize(fp);
            files[filePath] = {
                text: fs.readFileSync(filePath, 'utf-8'),
                version: 0
            };
          });
    }
    catch (exc) {
        let filePathError = `A file specified in tsconfig.json could not be found: ${ filePath }`;
        return { error: {
            message: filePathError.red,
            rawMessage: filePathError,
            loaderSource: 'ts-loader'
        }};
    }

    let newLine =
        compilerOptions.newLine === 0 /* CarriageReturnLineFeed */ ? '\r\n' :
        compilerOptions.newLine === 1 /* LineFeed */ ? '\n' :
        os.EOL;

    // make a (sync) resolver that follows webpack's rules
    let resolver = makeResolver(loader.options);

    var readFile = function(fileName) {
        fileName = path.normalize(fileName);
        try {
            return fs.readFileSync(fileName, {encoding: 'utf8'})
        }
        catch (e) {
            return;
        }
    }

    var moduleResolutionHost = {
        fileExists: (fileName: string) => readFile(fileName) !== undefined,
        readFile: (fileName: string) => readFile(fileName)
    };

    // Create the TypeScript language service
    var servicesHost = {
        getProjectVersion: () => instance.version+'',
        getScriptFileNames: () => Object.keys(files).filter(filePath => scriptRegex.test(filePath)),
        getScriptVersion: fileName => {
            fileName = path.normalize(fileName);
            return files[fileName] && files[fileName].version.toString();
        },
        getScriptSnapshot: fileName => {
            // This is called any time TypeScript needs a file's text
            // We either load from memory or from disk
            fileName = path.normalize(fileName);
            var file = files[fileName];

            if (!file) {
                let text = readFile(fileName);
                if (text == null) return;

                file = files[fileName] = { version: 0, text }
            }

            return compiler.ScriptSnapshot.fromString(file.text);
        },
        /**
         * getDirectories is also required for full import and type reference completions.
         * Without it defined, certain completions will not be provided
         */
        getDirectories: typescript.sys ? (<any>typescript.sys).getDirectories : undefined,

        /**
         * For @types expansion, these two functions are needed.
         */
        directoryExists: typescript.sys ? (<any>typescript.sys).directoryExists : undefined,
        getCurrentDirectory: () => process.cwd(),

        getCompilationSettings: () => compilerOptions,
        getDefaultLibFileName: options => compiler.getDefaultLibFilePath(options),
        getNewLine: () => newLine,
        log: log,
        resolveModuleNames: (moduleNames: string[], containingFile: string) => {
            let resolvedModules: any[] = [];

            for (let moduleName of moduleNames) {
                let resolvedFileName: string;
                let resolutionResult: any;

                try {
                    resolvedFileName = resolver.resolveSync(path.normalize(path.dirname(containingFile)), moduleName)

                    if (!resolvedFileName.match(scriptRegex)) resolvedFileName = null;
                    else resolutionResult = { resolvedFileName };
                }
                catch (e) { resolvedFileName = null }

                let tsResolution: ResolvedModule = compiler.resolveModuleName(moduleName, containingFile, compilerOptions, moduleResolutionHost);

                if (tsResolution.resolvedModule) {
                    if (resolvedFileName) {
                        if (resolvedFileName == tsResolution.resolvedModule.resolvedFileName) {
                            resolutionResult.isExternalLibraryImport = tsResolution.resolvedModule.isExternalLibraryImport;
                        }
                    }
                    else resolutionResult = tsResolution.resolvedModule;
                }

                resolvedModules.push(resolutionResult);
            }
            
            instance.dependencyGraph[path.normalize(containingFile)] = resolvedModules.filter(m => m != null).map(m => m.resolvedFileName);
            
            return resolvedModules;
        }
    };

    var languageService = instance.languageService = compiler.createLanguageService(servicesHost, compiler.createDocumentRegistry());

    var getCompilerOptionDiagnostics = true;

    loader._compiler.plugin("after-compile", (compilation, callback) => {
        // Don't add errors for child compilations
        if (compilation.compiler.isChild()) {
            callback();
            return;
        }
        
        let stats = compilation.stats;

        // handle all other errors. The basic approach here to get accurate error
        // reporting is to start with a "blank slate" each compilation and gather
        // all errors from all files. Since webpack tracks errors in a module from
        // compilation-to-compilation, and since not every module always runs through
        // the loader, we need to detect and remove any pre-existing errors.

        function removeTSLoaderErrors(errors: WebpackError[]) {
            let index = -1, length = errors.length;
            while (++index < length) {
                if (errors[index].loaderSource == 'ts-loader') {
                    errors.splice(index--, 1);
                    length--;
                }
            }
        }

        removeTSLoaderErrors(compilation.errors);

        // handle compiler option errors after the first compile
        if (getCompilerOptionDiagnostics) {
            getCompilerOptionDiagnostics = false;
            pushArray(
                compilation.errors,
                formatErrors(languageService.getCompilerOptionsDiagnostics(), instance, {file: configFilePath || 'tsconfig.json'}));
        }

        // build map of all modules based on normalized filename
        // this is used for quick-lookup when trying to find modules
        // based on filepath
        let modules = {};
        compilation.modules.forEach(module => {
            if (module.resource) {
                let modulePath = path.normalize(module.resource);
                if (hasOwnProperty(modules, modulePath)) {
                    let existingModules = modules[modulePath];
                    if (existingModules.indexOf(module) == -1) {
                        existingModules.push(module);
                    }
                }
                else {
                    modules[modulePath] = [module];
                }
            }
        })

        // gather all errors from TypeScript and output them to webpack
        Object.keys(instance.files)
            .filter(filePath => !!filePath.match(/(\.d)?\.ts(x?)$/))
            .forEach(filePath => {
                let errors = languageService.getSyntacticDiagnostics(filePath).concat(languageService.getSemanticDiagnostics(filePath));

                // if we have access to a webpack module, use that
                if (hasOwnProperty(modules, filePath)) {
                    let associatedModules = modules[filePath];

                    associatedModules.forEach(module => {
                        // remove any existing errors
                        removeTSLoaderErrors(module.errors);

                        // append errors
                        let formattedErrors = formatErrors(errors, instance, { module });
                        pushArray(module.errors, formattedErrors);
                        pushArray(compilation.errors, formattedErrors);
                    })
                }
                // otherwise it's a more generic error
                else {
                    pushArray(compilation.errors, formatErrors(errors, instance, {file: filePath}));
                }
            });


        // gather all declaration files from TypeScript and output them to webpack
        Object.keys(instance.files)
            .filter(filePath => !!filePath.match(/\.ts(x?)$/))
            .forEach(filePath => {
                let output = languageService.getEmitOutput(filePath);
                let declarationFile = output.outputFiles.filter(filePath => !!filePath.name.match(/\.d.ts$/)).pop();
                if (declarationFile) {
                    let assetPath = path.relative(compilation.compiler.context, declarationFile.name);
                    compilation.assets[assetPath] = {
                        source: () => declarationFile.text,
                        size: () => declarationFile.text.length
                    };
                }
            });

        callback();
    });

    // manually update changed files
    loader._compiler.plugin("watch-run", (watching, cb) => {
        var mtimes = watching.compiler.watchFileSystem.watcher.mtimes;
        Object.keys(mtimes)
            .filter(filePath => !!filePath.match(/\.tsx?$|\.jsx?$/))
            .forEach(filePath => {
                filePath = path.normalize(filePath);
                var file = instance.files[filePath];
                if (file) {
                    file.text = fs.readFileSync(filePath, {encoding: 'utf8'});
                    file.version++;
                    instance.version++;
                }
            });
        cb()
    })

    return { instance };
}

function loader(contents) {
    this.cacheable && this.cacheable();
    var callback = this.async();
    var filePath = path.normalize(this.resourcePath);

    var queryOptions = loaderUtils.parseQuery<LoaderOptions>(this.query);
    var configFileOptions = this.options.ts || {};

    var options = objectAssign<LoaderOptions>({}, {
        silent: false,
        logLevel: 'INFO',
        logInfoToStdOut: false,
        instance: 'default',
        compiler: 'typescript',
        configFileName: 'tsconfig.json',
        transpileOnly: false,
        compilerOptions: {}
    }, configFileOptions, queryOptions);
    options.ignoreDiagnostics = arrify(options.ignoreDiagnostics).map(Number);
    options.logLevel = options.logLevel.toUpperCase();

    // differentiate the TypeScript instance based on the webpack instance
    var webpackIndex = webpackInstances.indexOf(this._compiler);
    if (webpackIndex == -1) {
        webpackIndex = webpackInstances.push(this._compiler)-1;
    }
    options.instance = webpackIndex + '_' + options.instance;

    var { instance, error } = ensureTypeScriptInstance(options, this);

    if (error) {
        callback(error)
        return;
    }

    // Update file contents
    var file = instance.files[filePath]
    if (!file) {
        file = instance.files[filePath] = <TSFile>{ version: 0 };
    }

    if (file.text !== contents) {
        file.version++;
        file.text = contents;
        instance.version++;
    }

    var outputText: string, sourceMapText: string, diagnostics: typescript.Diagnostic[] = [];

    if (options.transpileOnly) {
        var fileName = path.basename(filePath);
        var transpileResult = instance.compiler.transpileModule(contents, {
            compilerOptions: instance.compilerOptions,
            reportDiagnostics: true,
            fileName
        });

        ({ outputText, sourceMapText, diagnostics } = transpileResult);

        pushArray(this._module.errors, formatErrors(diagnostics, instance, {module: this._module}));
    }
    else {
        let langService = instance.languageService;

        // Emit Javascript
        var output = langService.getEmitOutput(filePath);
        
        // Make this file dependent on *all* definition files in the program
        this.clearDependencies();
        this.addDependency(filePath);

        let allDefinitionFiles = Object.keys(instance.files).filter(filePath => /\.d\.ts$/.test(filePath));
        allDefinitionFiles.forEach(this.addDependency.bind(this));

        // Additionally make this file dependent on all imported files
        let additionalDependencies = instance.dependencyGraph[filePath];
        if (additionalDependencies) {
            additionalDependencies.forEach(this.addDependency.bind(this))  
        }
        
        this._module.meta.tsLoaderDefinitionFileVersions = allDefinitionFiles
            .concat(additionalDependencies)
            .map(filePath => filePath+'@'+(instance.files[filePath] || {version: '?'}).version);

        var outputFile = output.outputFiles.filter(file => !!file.name.match(/\.js(x?)$/)).pop();
        if (outputFile) { outputText = outputFile.text }

        var sourceMapFile = output.outputFiles.filter(file => !!file.name.match(/\.js(x?)\.map$/)).pop();
        if (sourceMapFile) { sourceMapText = sourceMapFile.text }
    }

    if (outputText == null) throw new Error(`Typescript emitted no output for ${filePath}`);

    if (sourceMapText) {
        var sourceMap = JSON.parse(sourceMapText);
        sourceMap.sources = [loaderUtils.getRemainingRequest(this)];
        sourceMap.file = filePath;
        sourceMap.sourcesContent = [contents];
        outputText = outputText.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '');
    }

    // Make sure webpack is aware that even though the emitted JavaScript may be the same as
    // a previously cached version the TypeScript may be different and therefore should be
    // treated as new
    this._module.meta.tsLoaderFileVersion = file.version;

    callback(null, outputText, sourceMap)
}

export = loader;
