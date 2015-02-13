///<reference path="node_modules/typescript/bin/typescript.d.ts" />
///<reference path="node_modules/typescript/bin/typescript_internal.d.ts" />
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

function ensureTypeScriptInstance(options: Options): TSInstance {

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

    var compilerOptions: typescript.CompilerOptions = {
        target: target,
        module: options.module == "AMD" ? typescript.ModuleKind.AMD : typescript.ModuleKind.CommonJS,
        sourceMap: !!options.sourceMap,
        noImplicitAny: !!options.noImplicitAny
    }

    options.additionalFiles.push(path.join(path.dirname(require.resolve('typescript')), 'lib.d.ts'));
    
    options.additionalFiles.forEach(filePath => {
        files[filePath] = {
            text: fs.readFileSync(filePath, 'utf-8'),
            version: 0
        }
    });

    var servicesHost = {
        getScriptFileNames: () => Object.keys(files),
        getScriptVersion: filename => files[filename] && files[filename].version.toString(),
        getScriptSnapshot: filename => {
            var file = files[filename];
            return {
                getText: (start, end) => file.text.substring(start, end),
                getLength: () => file.text.length,
                getLineStartPositions: () => [],
                getChangeRange: oldSnapshot => undefined
            };
        },
        getCurrentDirectory: () => process.cwd(),
        getScriptIsOpen: () => true,
        getCompilationSettings: () => compilerOptions,
        getDefaultLibFilename: options => 'lib.d.ts',
        // getNewLine() should work in next version of TypeScript
        // see https://github.com/Microsoft/TypeScript/issues/1653
        //getNewLine: () => { return os.EOL },
        log: message => console.log(message)
    };

    var languageService = compiler.createLanguageService(servicesHost, compiler.createDocumentRegistry())
    
    return instances[options.instance] = {
        compiler: compiler,
        compilerOptions: compilerOptions,
        files: files,
        languageService: languageService
    }
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
    
    var instance = ensureTypeScriptInstance(options);

    if (!Object.prototype.hasOwnProperty.call(instance.files, filePath)) {

        var filePaths = Object.keys(instance.files);
        filePaths.push(filePath)
    
        var program = instance.compiler.createProgram(filePaths, instance.compilerOptions, instance.compiler.createCompilerHost(instance.compilerOptions));
 
        program.getSourceFiles().forEach(file => {
            var filePath = path.normalize(file.filename);
            if (!Object.prototype.hasOwnProperty.call(instance.files, filePath)) {
                instance.files[filePath] = { version: 0, text: file.text };
            }
        })
    }
    
    var file = instance.files[filePath],
        langService = instance.languageService;
    
    file.text = contents;
    file.version++;

    var output = langService.getEmitOutput(filePath);

    var diagnostics = langService.getCompilerOptionsDiagnostics()
        .concat(langService.getSyntacticDiagnostics(filePath))
        .concat(langService.getSemanticDiagnostics(filePath))
        .forEach(diagnostic => {
            if (diagnostic.file) {
                var lineChar = diagnostic.file.getLineAndCharacterFromPosition(diagnostic.start);
                this.emitError(`  ${diagnostic.file.filename.blue} (${lineChar.line.toString().cyan},${lineChar.character.toString().cyan}): ${diagnostic.messageText.red}`)
            }
            else {
                this.emitError(`  ${"unknown file".blue}: ${diagnostic.messageText.red}`)
            }
        });

    if (output.outputFiles.length == 0) throw new Error(`Typescript emitted no output for ${filePath}`);
    
    var sourceMap: any;
    if (options.sourceMap) {
        sourceMap = JSON.parse(output.outputFiles[0].text);
        sourceMap.sourcesContent = [contents];
        contents = output.outputFiles[1].text;
    }
    else {
        contents = output.outputFiles[0].text;
    }
    contents = contents.replace(/\r\n/g, os.EOL);
    
    callback(null, contents, sourceMap)
}

export = loader;