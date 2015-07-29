///<reference path="typings/typescript/typescript.d.ts" />
///<reference path="typings/node/node.d.ts" />
///<reference path="typings/loaderUtils/loaderUtils.d.ts" />
///<reference path="typings/objectAssign/objectAssign.d.ts" />
///<reference path="typings/colors/colors.d.ts" />
import typescript = require('typescript')
import path = require('path')
import fs = require('fs');
import os = require('os');
import loaderUtils = require('loader-utils');
import objectAssign = require('object-assign');
require('colors');

interface Options {
    silent: boolean;
    instance: string;
    compiler: string;
    configFileName: string;
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
    files: TSFiles;
    languageService: typescript.LanguageService;
}

interface TSInstances {
    [name: string]: TSInstance;
}

interface Diagnostic extends typescript.Diagnostic {
    fileName?: string;
}

var instances = <TSInstances>{};
var webpackInstances = [];

// Take TypeScript errors, parse them and "pretty-print" to a passed-in function
// The passed-in function can either console.log them or add them to webpack's
// list of errors
function handleErrors(diagnostics: Diagnostic[], compiler: typeof typescript, outputFn: (prettyMessage: string, rawMessage: string, loc: {line: number, character: number}) => any) {
    diagnostics.forEach(diagnostic => {
        var messageText = compiler.flattenDiagnosticMessageText(diagnostic.messageText, os.EOL);
        if (diagnostic.file) {
            var lineChar = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            outputFn(
                `  ${diagnostic.file.fileName.blue} (${(lineChar.line+1).toString().cyan},${(lineChar.character+1).toString().cyan}): ${messageText.red}`, 
                messageText,
                {line: lineChar.line+1, character: lineChar.character+1}
            );
        }
        else if (diagnostic.fileName) {
            outputFn(`  ${diagnostic.fileName.blue}: ${messageText.red}`, messageText, null)
        }
        else {
            outputFn(`  ${"unknown file".blue}: ${messageText.red}`, messageText, null)
        }
    });
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
function ensureTypeScriptInstance(options: Options, loader: any): { instance?: TSInstance, error?: any } {

    function log(...messages: string[]): void {
        if (!options.silent) {
            console.log.apply(console, messages);
        }
    }
    
    var compiler = require(options.compiler);
    var files = <TSFiles>{};
    
    if (Object.prototype.hasOwnProperty.call(instances, options.instance)) {
        return { instance: instances[options.instance] };        
    }
    
    var compilerOptions: typescript.CompilerOptions = {
        module: 1 /* CommonJS */
    };
    
    // Load any available tsconfig.json file
    var filesToLoad = [];
    var configFilePath = findConfigFile(compiler, path.dirname(loader.resourcePath), options.configFileName);
    if (configFilePath) {
        log('Using config file at '.green + configFilePath.blue);
        var configFile = compiler.readConfigFile(configFilePath);
        
        if (configFile.error) {
            var configFileError;
            (<Diagnostic>configFile.error).fileName = configFilePath;
            handleErrors(
                [configFile.error], 
                compiler, 
                (message, rawMessage, location) => {
                    configFileError = {
                        file: configFilePath,
                        module: loader._module,
                        message: message,
                        rawMessage: rawMessage,
                        location: location
                    }
                });
            return { error: configFileError }
        }
        var configParseResult = compiler.parseConfigFile(configFile.config, compiler.sys, path.dirname(configFilePath));
        
        if (configParseResult.errors.length) {
            configParseResult.errors.forEach(error => error.fileName = configFilePath);
            handleErrors(
                configParseResult.errors, 
                compiler, 
                (message, rawMessage, location) => {
                    loader._module.errors.push({
                        file: configFilePath,
                        module: loader._module,
                        message: message,
                        rawMessage: rawMessage,
                        location: location
                    })
                });
            return { error: {
                file: configFilePath,
                module: loader._module,
                message: 'error while parsing tsconfig.json'.red,
                rawMessage: 'error while parsing tsconfig.json'
            }};
        }
        
        objectAssign(compilerOptions, configParseResult.options);
        filesToLoad = configParseResult.fileNames;
    }
    
    var libFileName = 'lib.d.ts';

    // Special handling for ES6 targets
    if (compilerOptions.target == 2 /* ES6 */) {
        compilerOptions.module = 0 /* None */;
        libFileName = 'lib.es6.d.ts';
    }
    
    if (!compilerOptions.noLib) {
        filesToLoad.push(path.join(path.dirname(require.resolve('typescript')), libFileName));
    }
    
    // Load initial files (core lib files, any files specified in tsconfig.json)
    filesToLoad.forEach(filePath => {
        filePath = path.normalize(filePath);
        files[filePath] = {
            text: fs.readFileSync(filePath, 'utf-8'),
            version: 0
        }
    });

    // Create the TypeScript language service
    var servicesHost = {
        getScriptFileNames: () => Object.keys(files),
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
                try {
                    file = files[fileName] = {
                        version: 0, 
                        text: fs.readFileSync(fileName, {encoding: 'utf8'})
                    }
                }
                catch (e) {
                    return;
                }
            } 
            
            return compiler.ScriptSnapshot.fromString(file.text);
        },
        getCurrentDirectory: () => process.cwd(),
        getCompilationSettings: () => compilerOptions,
        getDefaultLibFileName: options => libFileName,
        getNewLine: () => { return os.EOL },
        log: log
    };

    var languageService = compiler.createLanguageService(servicesHost, compiler.createDocumentRegistry())
    
    var instance: TSInstance = instances[options.instance] = {
        compiler: compiler,
        compilerOptions: compilerOptions,
        files: files,
        languageService: languageService
    };
    
    var compilerOptionDiagnostics = languageService.getCompilerOptionsDiagnostics();
    
    loader._compiler.plugin("done", stats => {
        // handle compiler option errors after the first compile
        handleErrors(
            compilerOptionDiagnostics,
            compiler, 
            (message, rawMessage, location) => {
                stats.compilation.errors.push({
                    file: configFilePath || 'tsconfig.json',
                    message: message,
                    rawMessage: rawMessage
                })
            }
        );
        compilerOptionDiagnostics = [];
        
        // handle errors for all declaration files at the end of each compilation
        Object.keys(instance.files)
            .filter(filePath => !!filePath.match(/\.d\.ts$/))
            .forEach(filePath => {
                handleErrors(
                    languageService.getSyntacticDiagnostics(filePath).concat(languageService.getSemanticDiagnostics(filePath)),
                    compiler, 
                    (message, rawMessage, location) => {
                        stats.compilation.errors.push({
                            file: filePath,
                            message: message,
                            rawMessage: rawMessage,
                            location: location
                        })
                    }
                );
            });
    });
    
    // manually update changed declaration files
    loader._compiler.plugin("watch-run", (watching, cb) => {
        var mtimes = watching.compiler.watchFileSystem.watcher.mtimes;
        Object.keys(mtimes)
            .filter(filePath => !!filePath.match(/\.d\.ts$/))
            .forEach(filePath => {
                filePath = path.normalize(filePath);
                var file = instance.files[filePath];
                if (file) {
                    file.text = fs.readFileSync(filePath, {encoding: 'utf8'});
                    file.version++;
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
    
    var queryOptions = loaderUtils.parseQuery<Options>(this.query);
    var configFileOptions = this.options.ts || {};
    
    var options = objectAssign<Options>({}, {
        silent: false,
        instance: 'default',
        compiler: 'typescript',
        configFileName: 'tsconfig.json'
    }, configFileOptions, queryOptions);
    
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
    
    var file = instance.files[filePath],
        langService = instance.languageService;
    
    // Update TypeScript with the new file contents
    if (!file) {
        file = instance.files[filePath] = <TSFile>{ version: 0 };
    }
    
    file.text = contents;
    file.version++;
    
    // Make this file dependent on *all* definition files in the program
    this.clearDependencies();
    this.addDependency(filePath);
    Object.keys(instance.files).filter(filePath => !!filePath.match(/\.d\.ts$/)).forEach(this.addDependency.bind(this));

    // Emit Javascript
    var output = langService.getEmitOutput(filePath);
    handleErrors(
        langService.getSyntacticDiagnostics(filePath).concat(langService.getSemanticDiagnostics(filePath)), 
        instance.compiler, 
        (message, rawMessage, location) => {
            this._module.errors.push({
                module: this._module,
                message: message,
                rawMessage: rawMessage,
                location: location
            });
        }
    );

    if (output.outputFiles.length == 0) throw new Error(`Typescript emitted no output for ${filePath}`);
    
    var sourceMap: any;
    if (output.outputFiles.length == 2) {
        sourceMap = JSON.parse(output.outputFiles[0].text);
        sourceMap.sources = [loaderUtils.getRemainingRequest(this)];
        sourceMap.file = loaderUtils.getCurrentRequest(this);
        sourceMap.sourcesContent = [contents];
        contents = output.outputFiles[1].text.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '');
    }
    else {
        contents = output.outputFiles[0].text;
    }

    // Make sure webpack is aware that even though the emitted JavaScript may be the same as
    // a previously cached version the TypeScript may be different and therefore should be
    // treated as new
    this._module.meta['tsLoaderFileVersion'] = file.version;

    callback(null, contents, sourceMap)
}

export = loader;
