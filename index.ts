///<reference path="node_modules/typescript/bin/typescript.d.ts" />
///<reference path="node_modules/typescript/bin/typescriptServices.d.ts" />
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

interface Dependency {
    original: string;
    resolved: string;
    pos: number;
    end: number;
    reference: boolean;
}

interface Options {
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

var instances = <TSInstances>{};

function consoleError(msg) {
    setTimeout(() => console.log('ERROR'+os.EOL+msg), 0)
}

function handleErrors(diagnostics: typescript.Diagnostic[], compiler: typeof typescript, outputFn: (prettyMessage: string, rawMessage: string, loc: {line: number, character: number}) => any) {
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
        else {
            outputFn(`  ${"unknown file".blue}: ${messageText.red}`, messageText, null)
        }
    });
}

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

function ensureTypeScriptInstance(options: Options, loader: any): TSInstance {

    var compiler = require(options.compiler);
    var files = <TSFiles>{};
    
    if (Object.prototype.hasOwnProperty.call(instances, options.instance)) {
        return instances[options.instance];        
    }
    
    var compilerOptions: typescript.CompilerOptions = {
        module: typescript.ModuleKind.CommonJS
    };
    
    var filesToLoad = [];
    var configFilePath = findConfigFile(compiler, path.dirname(loader.resourcePath), options.configFileName);
    if (configFilePath) {
        console.log('Using config file at '.green + configFilePath.blue);
        var configFile = compiler.readConfigFile(configFilePath);
        // TODO: when 1.5 stable comes out, this will never be undefined. Instead it will
        // have an 'error' property
        if (!configFile) {
            throw new Error('tsconfig.json file found but not parsable');
        }
        
        var configParseResult = compiler.parseConfigFile(configFile, path.dirname(configFilePath));
        if (configParseResult.errors.length) {
            handleErrors(languageService.getCompilerOptionsDiagnostics(), compiler, consoleError);
            throw new Error('error while parsing tsconfig.json');
        }
        
        objectAssign(compilerOptions, configParseResult.options);
        filesToLoad = configParseResult.fileNames;
    }
    
    var libFileName = 'lib.d.ts';

    if (compilerOptions.target == typescript.ScriptTarget.ES6) {
        // Special handling for ES6 targets
        compilerOptions.module = typescript.ModuleKind.None;
        libFileName = 'lib.es6.d.ts';
    }
    
    if (!compilerOptions.noLib) {
        filesToLoad.push(path.join(path.dirname(require.resolve('typescript')), libFileName));
    }
    
    filesToLoad.forEach(filePath => {
        filePath = path.normalize(filePath);
        files[filePath] = {
            text: fs.readFileSync(filePath, 'utf-8'),
            version: 0
        }
    });

    var servicesHost = {
        getScriptFileNames: () => Object.keys(files),
        getScriptVersion: fileName => {
            fileName = path.normalize(fileName);
            return files[fileName] && files[fileName].version.toString();
        },
        getScriptSnapshot: fileName => {
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
        log: message => console.log(message)
    };

    var languageService = compiler.createLanguageService(servicesHost, compiler.createDocumentRegistry())
    
    var instance: TSInstance = instances[options.instance] = {
        compiler: compiler,
        compilerOptions: compilerOptions,
        files: files,
        languageService: languageService
    };
    
    handleErrors(languageService.getCompilerOptionsDiagnostics(), compiler, consoleError);
    
    // handle errors for all declaration files at the end of each compilation
    loader._compiler.plugin("done", stats => {
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
    
    return instance;
}

function loader(contents) {
    this.cacheable && this.cacheable();
    var callback = this.async();
    var filePath = path.normalize(this.resourcePath);
    
    var options = loaderUtils.parseQuery<Options>(this.query);
    options = objectAssign<Options>({}, {
        instance: 'default',
        compiler: 'typescript',
        configFileName: 'tsconfig.json'
    }, options);
    
    var instance = ensureTypeScriptInstance(options, this),
        file = instance.files[filePath],
        langService = instance.languageService;
    
    if (!file) {
        file = instance.files[filePath] = <TSFile>{ version: 0 };
    }
    
    file.text = contents;
    file.version++;
    
    this.clearDependencies();
    this.addDependency(filePath);
    Object.keys(instance.files).filter(filePath => !!filePath.match(/\.d\.ts$/)).forEach(this.addDependency.bind(this));

    var output = langService.getEmitOutput(filePath);
    handleErrors(
        langService.getSyntacticDiagnostics(filePath).concat(langService.getSemanticDiagnostics(filePath)), 
        instance.compiler, 
        (message, rawMessage, location) => {
            this._module.errors.push({
                file: filePath,
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

    this._module.meta['tsLoaderFileVersion'] = file.version;

    callback(null, contents, sourceMap)
}

export = loader;