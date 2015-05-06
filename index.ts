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
    sourceMap: boolean;
    noImplicitAny: boolean;
    target: string;
    module: string;
    additionalFiles: string[];
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

function handleErrors(diagnostics: typescript.Diagnostic[], compiler: typeof typescript, outputFn: (msg: string) => any) {
    diagnostics.forEach(diagnostic => {
        var messageText = compiler.flattenDiagnosticMessageText(diagnostic.messageText, os.EOL);
        if (diagnostic.file) {
            var lineChar = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            outputFn(`  ${diagnostic.file.fileName.blue} (${lineChar.line.toString().cyan},${lineChar.character.toString().cyan}): ${messageText.red}`)
        }
        else {
            outputFn(`  ${"unknown file".blue}: ${messageText.red}`)
        }
    });
}

function ensureTypeScriptInstance(options: Options, loader: any): TSInstance {

    var compiler = require(options.compiler);
    var files = <TSFiles>{};
    
    if (Object.prototype.hasOwnProperty.call(instances, options.instance)) {
        var instance = instances[options.instance];
        files = instance.files;
        
        options.additionalFiles.forEach(filePath => {
            if (!Object.prototype.hasOwnProperty.call(options.additionalFiles, filePath)) {
                files[filePath] = {
                    text: fs.readFileSync(filePath, 'utf-8'),
                    version: 0
                }
            }
        });
        
        return instance;
    }
    
    var target: typescript.ScriptTarget;
    switch (options.target) {
        case "ES3": target = typescript.ScriptTarget.ES3; break;
        case "ES6": target = typescript.ScriptTarget.ES6; break;
        default: target = typescript.ScriptTarget.ES5;
    }
    
    var module = options.module == "AMD" ? typescript.ModuleKind.AMD : typescript.ModuleKind.CommonJS;
    var libFileName = 'lib.d.ts';
    
    if (target == typescript.ScriptTarget.ES6) {
        // Special handling for ES6 targets
        module = typescript.ModuleKind.None;
        libFileName = 'lib.es6.d.ts';
    }

    var compilerOptions: typescript.CompilerOptions = {
        target: target,
        module: module,
        sourceMap: !!options.sourceMap,
        noImplicitAny: !!options.noImplicitAny
    }
    
    options.additionalFiles.push(path.join(path.dirname(require.resolve('typescript')), libFileName));
    
    options.additionalFiles.forEach(filePath => {
        files[filePath] = {
            text: fs.readFileSync(filePath, 'utf-8'),
            version: 0
        }
    });

    var servicesHost = {
        getScriptFileNames: () => Object.keys(files),
        getScriptVersion: fileName => files[fileName] && files[fileName].version.toString(),
        getScriptSnapshot: fileName => {
            var file = files[fileName];
            if (!file) return undefined;
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
                handleErrors(languageService.getSyntacticDiagnostics(filePath).concat(languageService.getSemanticDiagnostics(filePath)), compiler, consoleError);
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
        sourceMap: false,
        additionalFiles: []
    }, options);
    
    options.additionalFiles = options.additionalFiles.map(filePath => path.resolve(this.context, filePath));
    
    var instance = ensureTypeScriptInstance(options, this);

    if (!Object.prototype.hasOwnProperty.call(instance.files, filePath)) {

        var filePaths = Object.keys(instance.files);
        filePaths.push(filePath)
    
        var program = instance.compiler.createProgram(filePaths, instance.compilerOptions, instance.compiler.createCompilerHost(instance.compilerOptions));
 
        program.getSourceFiles().forEach(file => {
            var filePath = path.normalize(file.fileName);
            if (!Object.prototype.hasOwnProperty.call(instance.files, filePath)) {
                instance.files[filePath] = { version: 0, text: file.text };
            }
        })
    }
    
    var file = instance.files[filePath],
        langService = instance.languageService;
    
    file.text = contents;
    file.version++;
    
    this.clearDependencies();
    this.addDependency(filePath);
    Object.keys(instance.files).filter(filePath => !!filePath.match(/\.d\.ts$/)).forEach(this.addDependency.bind(this));

    var output = langService.getEmitOutput(filePath);
    handleErrors(langService.getSyntacticDiagnostics(filePath).concat(langService.getSemanticDiagnostics(filePath)), instance.compiler, this.emitError.bind(this));
    
    if (output.outputFiles.length == 0) throw new Error(`Typescript emitted no output for ${filePath}`);
    
    var sourceMap: any;
    if (options.sourceMap) {
        sourceMap = JSON.parse(output.outputFiles[0].text);
        sourceMap.sources = [loaderUtils.getRemainingRequest(this)];
        sourceMap.file = loaderUtils.getCurrentRequest(this);
        sourceMap.sourcesContent = [contents];
        contents = output.outputFiles[1].text.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '');
    }
    else {
        contents = output.outputFiles[0].text;
    }
    
    callback(null, contents, sourceMap)
}

export = loader;