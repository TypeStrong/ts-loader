///<reference path="node_modules/typescript/bin/typescript.d.ts" />
///<reference path="node_modules/typescript/bin/typescript_internal.d.ts" />
///<reference path="node_modules/typescript/bin/typescriptServices.d.ts" />
///<reference path="typings/node/node.d.ts" />
///<reference path="typings/q/Q.d.ts" />

import typescript = require('typescript')
import path = require('path')
import fs = require('fs');
import Q = require('q');

interface Dependency {
    original: string;
    resolved: string;
    pos: number;
    end: number;
    reference: boolean;
}

var readFile = Q.denodeify<string>(fs.readFile);

var compilerOptions: typescript.CompilerOptions = {
    target: typescript.ScriptTarget.ES5,
    module: typescript.ModuleKind.CommonJS,
    sourceMap: true
}
var files = {};

var libPath = path.join(path.dirname(require.resolve('typescript')), 'lib.d.ts');
files[libPath] = {
    text: fs.readFileSync(libPath, 'utf-8'),
    version: 0
}

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
    log: message => console.log(message)
};

var langService = typescript.createLanguageService(servicesHost, typescript.createDocumentRegistry())

function rootReferencePath(referencePath: string, dirname: string) {
    return typescript.isRootedDiskPath(referencePath) ? referencePath : typescript.combinePaths(dirname, referencePath)
}

function loadDependenciesAndTransform(filePath: string, contents: string): Q.Promise<string> {
    filePath = path.normalize(filePath);
    var resolve = Q.denodeify<string>(this.resolve.bind(this));

    if (!Object.prototype.hasOwnProperty.call(files, filePath)) {

        var fileInfo = typescript.preProcessFile(contents)

        var dirname = path.dirname(filePath);

        var dependencies = fileInfo.referencedFiles.concat(fileInfo.importedFiles).map(f => <Dependency>({
                original: f.filename,
                resolved: '',
                pos: f.pos,
                end: f.end,
                reference: fileInfo.referencedFiles.indexOf(f) != -1
            }));

        files[filePath] = { version: 0, text: contents }

        return Q.all(dependencies.map(f => resolve(dirname, f.reference ? rootReferencePath(f.original, dirname) : f.original)
                                           .then(newPath => f.resolved = newPath)
                                           .then(newPath => f)))
            .then(filePaths => filePaths.filter(f => f.resolved.match(/\.ts$/) != null)) // filter out any non-ts files
            .then(filePaths => Q.all(filePaths.map(f => readFile(f.resolved, 'utf-8').then(fileContents => loadDependenciesAndTransform.call(this, f.resolved, fileContents)))))
            .then(() => contents);
    }
    return Q(contents);
}

function loader(contents) {
    this.cacheable && this.cacheable();
    var callback = this.async();
    var filePath = path.normalize(this.resourcePath);

    Q.fcall(loadDependenciesAndTransform.bind(this), filePath, contents)
        .then(contents => {
            var file = files[filePath];
            file.text = contents;
            file.version++;

            var output = langService.getEmitOutput(filePath);

            var diagnostics = langService.getCompilerOptionsDiagnostics()
                .concat(langService.getSyntacticDiagnostics(filePath))
                .concat(langService.getSemanticDiagnostics(filePath))
                .forEach(diagnostic => {
                    if (diagnostic.file) {
                        var lineChar = diagnostic.file.getLineAndCharacterFromPosition(diagnostic.start);
                        this.emitError(`  ${diagnostic.file && diagnostic.file.filename} (${lineChar.line},${lineChar.character}): ${diagnostic.messageText}`)
                    }
                    else {
                        this.emitError(`  unknown file: ${diagnostic.messageText}`)
                    }
                });

            if (output.outputFiles.length == 0) throw new Error(`Typescript emitted no output for ${filePath}`);
            contents = output.outputFiles[1].text;
            var sourceMap = JSON.parse(output.outputFiles[0].text);
            sourceMap.sourcesContent = [contents];
            return [contents, sourceMap];
        })
        .done(contents => callback(null, contents[0], contents[1]), err => callback(err));
}

export = loader;