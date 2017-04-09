import typescript = require('typescript');
import path = require('path');
import interfaces = require('./interfaces');
import utils = require('./utils');

declare module './interfaces' {
    export interface Webpack {
        /**
         * Resolves the given request to a module, applies all configured loaders and calls back with the
         * generated source, the sourceMap and the module instance (usually an instance of NormalModule).
         * Use this function if you need to know the source code of another module to generate the result.
         */
        loadModule: (request: string, callback: (err: any, source: string, sourceMap: any, module: any) => void) => void;
    }

    export interface WebpackCompiler {
        outputPath: string;
    }

    export interface WebpackCompilation {
        fileDependencies: string[];
        contextDependencies: string[];
        missingDependencies: string[];
    }

    export interface TSInstance {
        cssModules?: CssModules;
    }

    export interface LoaderOptions {
        cssModules: CssModulesOptions;
    }
}

export interface ServicesHost {
    getScriptVersion(fileName: string): string;
    getScriptSnapshot(fileName: string): typescript.IScriptSnapshot;
    resolveModuleNames(moduleNames: string[], containingFile: string): interfaces.ResolvedModule[];
}

export interface CssModulesOptions {
    test: RegExp;
    include: string[];
    exclude: string[];
    save: boolean;
}

export class CssModules {
    constructor(readonly instance: interfaces.TSInstance, compiler: interfaces.Compiler, servicesHost: ServicesHost) {
        this.options = instance.loaderOptions.cssModules;
        this._cssModules = new CssModulesContainer(instance);

        this.isValid = !instance.loaderOptions.transpileOnly
            && this.options
            && !!this.options.test
            && !!servicesHost;

        // Bind methods to be used as plugins
        this.reset = this.reset.bind(this);
        this.watchRun = this.watchRun.bind(this);
        this.saveCssModules = this.saveCssModules.bind(this);
        this.afterEmit = this.afterEmit.bind(this);

        if (this.isValid) {
            this.wrapServiceHostAndCompiler(servicesHost);

            compiler.plugin("done", this.reset);
            compiler.plugin("watch-run", this.watchRun);

            if (this.options.save) {
                // Save used CSS module type definitions after compile
                compiler.plugin("emit", this.saveCssModules);
                compiler.plugin("after-emit", this.afterEmit);
            }
        }
    }

    private readonly _cssModules: CssModulesContainer;
    readonly options: CssModulesOptions;
    readonly isValid: boolean;

    loadCssModules(loader: interfaces.Webpack, contents: string, callback: (err: interfaces.WebpackError, cssModules?: CssModule[]) => void): void {
        if (!this.isValid) {
            // CSS modules not enabled
            return callback(null, []);
        }

        const imports = this.parseImports(loader.resourcePath, contents);

        Promise.all(imports.map(path => this.loadCssModule(loader, path)))
            .then(modules => callback(null, modules.filter(m => !!m)))
            .catch(err => callback(utils.makeError({ rawMessage: 'error while loading CSS modules', message: err.message })));
    }

    private correctPath(filePath: string): string {
        const cssModule = this._cssModules.get(filePath);
        return cssModule && cssModule.modulePath || filePath;
    }

    correctDependencies() {
        const { dependencyGraph, reverseDependencyGraph } = this.instance;
        if (!this.isValid) return;
        for (const filePath of Object.keys(dependencyGraph)) {
            const modules = dependencyGraph[filePath];
            for (const module of modules) {
                module.originalFileName = this.correctPath(module.originalFileName);
                module.resolvedFileName = this.correctPath(module.resolvedFileName);
            }
            const correctPath = this.correctPath(filePath);
            if (correctPath !== filePath) {
                dependencyGraph[correctPath] = modules;
                delete dependencyGraph[filePath];
            }
        }
        for (const filePath of Object.keys(reverseDependencyGraph)) {
            const files = reverseDependencyGraph[filePath];
            for (const filePath of Object.keys(files)) {
                const correctPath = this.correctPath(filePath);
                if (correctPath !== filePath) {
                    files[correctPath] = files[filePath];
                    delete files[filePath];
                }
            }
            const correctPath = this.correctPath(filePath);
            if (correctPath !== filePath) {
                reverseDependencyGraph[correctPath] = files;
                delete reverseDependencyGraph[filePath];
            }
        }
    }

    private wrapServiceHostAndCompiler(servicesHost: ServicesHost): void {
        const { compiler } = this.instance;
        const { getScriptVersion, getScriptSnapshot } = servicesHost;
        const { resolveModuleName } = compiler;

        compiler.resolveModuleName = (moduleName: string, containingFile: string, compilerOptions: typescript.CompilerOptions, host: typescript.ModuleResolutionHost, cache?: typescript.ModuleResolutionCache) => {
            const fileName = path.resolve(path.normalize(path.dirname(containingFile)), moduleName);
            const module = this._cssModules.get(fileName);
            if (module && module.isValid) {
                return {
                    resolvedModule:
                    {
                        resolvedFileName: module.dtsPath,
                        extension: typescript.Extension.Dts,
                        isExternalLibraryImport: false
                    }
                };
            }
            // Default resolveModuleName
            return resolveModuleName(moduleName, containingFile, compilerOptions, host, cache);
        };

        servicesHost.getScriptVersion = (fileName: string) => {
            const module = this._cssModules.get(fileName);
            if (module && module.isValid) {
                return module.fileVersion.toString();
            }
            // Default resolveModuleName
            return getScriptVersion(fileName);
        };

        servicesHost.getScriptSnapshot = (fileName: string) => {
            const module = this._cssModules.get(fileName);
            if (module && module.isValid) {
                return compiler.ScriptSnapshot.fromString(module.definitions);
            }
            // Default getScriptSnapshot
            return getScriptSnapshot(fileName);
        };
    }

    private loadCssModule(loader: interfaces.Webpack, modulePath: string): Promise<CssModule> {
        return new Promise<CssModule>(resolve => {
            const module: CssModule = this._cssModules.get(modulePath, true);

            if (module.isValid) {
                // Module is already loaded
                module.used = true;
                return resolve(module);
            }

            loader.loadModule(module.modulePath, (err, source) => {
                // Ignore errors
                if (err) return resolve(module);
                module.parse(source, this.startTime);
                module.used = true;
                resolve(module);
            });
        });
    }

    private reset(): void {
        this._saved = false;
        this._cssModules.reset();
        this._imports = {};
    }

    private _saved = false;
    private saveCssModules(compilation: interfaces.WebpackCompilation, callback: () => void) {
        if (this._saved) return callback();
        this._saved = true;

        if (this.isValid && this._cssModules) {
            for (const cssModule of this._cssModules.modules.filter(m => m.isValid && m.used)) {
                const existing = utils.readFile(cssModule.dtsPath);
                if (existing !== cssModule.definitions) {
                    const assetPath = path.relative(compilation.compiler.outputPath, cssModule.dtsPath).replace(/\\/g, '/');
                    compilation.assets[assetPath] = {
                        source: () => cssModule.definitions,
                        size: () => cssModule.definitions.length,
                    };
                }
            }
        }
        callback();
    }

    private afterEmit(compilation: interfaces.WebpackCompilation, callback: () => void) {
        // console.log('afterEmit/deps', {
        //     fileDependencies: compilation.fileDependencies.filter(f => this._cssModules.has(f)),
        //     contextDependencies: compilation.contextDependencies.filter(f => this._cssModules.has(f)),
        //     missingDependencies: compilation.missingDependencies.filter(f => this._cssModules.has(f))
        // });
        compilation.fileDependencies = compilation.fileDependencies.filter(filePath => {
            const module = this._cssModules.get(filePath);
            return !module || filePath !== module.dtsPath;
        });
        callback();
    }

    private startTime: number = new Date().getTime();
    private watchRun(watching: interfaces.WebpackWatching, callback: () => void) {
        const { test } = this.options;

        const watcher = watching.compiler.watchFileSystem.watcher ||
            watching.compiler.watchFileSystem.wfs.watcher;

        this.startTime = Math.max(this.startTime || watching.startTime);
        const times = watcher.getTimes();

        for (const filePath of Object.keys(times).filter(f => test.test(f))) {
            const time = times[filePath];
            const module = this._cssModules.get(filePath, false);
            if (module && time > module.time) {
                module.isValid = false;
                this.instance.version++;
            }
        }
        callback();
    }

    private _imports: { [modulePath: string]: string[] } = {};
    private parseImports(modulePath: string, sourceText?: string, visitedModules: { [modulePath: string]: boolean } = {}): string[] {
        const { compiler } = this.instance;
        const { test } = this.options;

        function readSourceText(filePaths: string[]): void {
            for (const filePath of filePaths) {
                sourceText = utils.readFile(filePath);
                if (typeof sourceText !== 'undefined') {
                    modulePath = filePath;
                    return;
                }
            }
        }

        if (typeof sourceText !== 'string') {
            const moduleNames = [modulePath];
            if (!/\.[jt]sx?$/.test(modulePath)) {
                moduleNames.push(modulePath + '.ts', modulePath + '.tsx', modulePath + '.d.ts');
            }
            readSourceText(moduleNames);
        }

        if (visitedModules[modulePath]) {
            return [];
        }
        visitedModules[modulePath] = true;

        let imports = this._imports[modulePath];
        if (imports) {
            return imports;
        }

        imports = [];

        const info = compiler.preProcessFile(sourceText);

        for (const importFile of info.importedFiles) {
            let fileName = importFile.fileName;
            if (/^\.\.?\//.test(fileName)) {
                fileName = path.resolve(path.dirname(modulePath), fileName);
                if (test.test(fileName)) {
                    imports.push(fileName);
                } else {
                    imports = imports.concat(this.parseImports(fileName, undefined, visitedModules));
                }
            }
        }

        return this._imports[modulePath] = imports;
    }
}

export class CssModule {
    constructor(readonly instance: interfaces.TSInstance, modulePath: string) {
        this.modulePath = path.resolve(modulePath);
        this.dtsPath = this.modulePath + '.d.ts';
    }

    readonly modulePath: string;
    readonly dtsPath: string;
    definitions: string;
    time = 0;
    fileVersion = 0;
    isValid = false;
    used = false;

    parse(source: string, time: number) {
        const classNames = this.parseClassNames(source);
        this.definitions = this.generateTypeDefinitions(classNames);
        this.fileVersion += 1;
        this.time = time;
        this.isValid = true;
    }

    private generateTypeDefinitions(classNames: string[]) {
        let typings = '';

        // Generate default object
        typings += 'declare const __styles: {\n';
        for (const className of classNames) {
            typings += `    ${JSON.stringify(className)}: string;\n`;
        }
        typings += '};\n';
        typings += 'export default __styles;\n\n';

        // Generate named exports
        for (const className of classNames) {
            if (className !== '__styles' && this.isValidIdentifier(className)) {
                typings += `export const ${className}: string;\n`;
            }
        }

        return typings;
    }

    private parseClassNames(source: string): string[] {
        const match = /exports.locals\s*=\s*({[^}]*})/.exec(source);
        const locals = match && JSON.parse(match[1]) || {};
        const classNames = [];
        for (const className in locals) {
            if (locals.hasOwnProperty(className)) {
                classNames.push(className);
            }
        }
        return classNames;
    }

    private isValidIdentifier(identifier: string): boolean {
        const { compiler } = this.instance;
        const { target } = this.instance.compilerOptions;

        if (!compiler.isIdentifierStart(identifier.charCodeAt(0), target)) {
            return false;
        }

        for (let i = 1; i < identifier.length; i++) {
            if (!compiler.isIdentifierPart(identifier.charCodeAt(i), target)) {
                return false;
            }
        }

        return true;
    }
}

class CssModulesContainer {
    constructor(readonly instance: interfaces.TSInstance) {
    }

    private readonly _moduleMap: { [modulePath: string]: CssModule } = {};
    private readonly _modules: CssModule[] = [];

    add(module: CssModule): CssModule {
        this._moduleMap[module.modulePath] = module;
        this._moduleMap[module.dtsPath] = module;
        this._modules.push(module);
        return module;
    }

    reset() {
        for (const module of this._modules) {
            module.used = false;
        }
    }

    has(modulePath: string): boolean {
        return this._moduleMap.hasOwnProperty(path.resolve(modulePath));
    }

    get(modulePath: string, create: boolean = false): CssModule {
        let module = this._moduleMap[path.resolve(modulePath)];

        if (create && !module) {
            module = this.add(new CssModule(this.instance, modulePath));
        }

        return module;
    }

    get modules(): CssModule[] {
        return this._modules.slice();
    }
}
