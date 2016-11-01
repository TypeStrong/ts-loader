import typescript = require('typescript');

export interface SourceMap {
    sources: any[];
    file: string;
    sourcesContent: string[];
}

export interface Webpack {
    _compiler: Compiler;
    _module: WebpackModule;
    cacheable: () => void;
    query: string;
    async: () => (err: Error | WebpackError, source?: string, map?: string) => void;
    resourcePath: string;
    resolve: () => void; // unused yet...
    addDependency: (dep: string) => void;
    clearDependencies: () => void;
    emitFile: (fileName: string, text: string) => void; // unused
    options: {
        ts: {},
        resolve: Resolve;
    };
}

interface Compiler {
    plugin: (name: string, callback: Function) => void;
}

export interface WebpackError {
    module?: any;
    file?: string;
    message: string;
    rawMessage: string;
    location?: { line: number, character: number };
    loaderSource: string;
}

/**
 * webpack/lib/Compilation.js
 */
export interface WebpackCompilation {
    compiler: WebpackCompiler;
    errors: WebpackError[];
    modules: WebpackModule[];
    assets: {
        [index: string]: {
            size: () => number;
            source: () => string;
        }
    };
}

/**
 * webpack/lib/Compiler.js
 */
export interface WebpackCompiler {
    isChild(): boolean;
    context: string; // a guess
    watchFileSystem: WebpackNodeWatchFileSystem;
}

export interface WebpackModule {
    resource: string;
    errors: WebpackError[];
    meta: {
        tsLoaderFileVersion: number;
        tsLoaderDefinitionFileVersions: string[];
    };
}

export interface WebpackNodeWatchFileSystem {
    watcher: {
        mtimes: number; // a guess
    };
}

export interface WebpackWatching {
    compiler: WebpackCompiler; // a guess
}

export interface Resolve {
    /** Replace modules by other modules or paths. */
    alias?: { [key: string]: string; };
    /**
     * The directory (absolute path) that contains your modules.
     * May also be an array of directories.
     * This setting should be used to add individual directories to the search path. 
     */
    root?: string | string[];
    /**
     * An array of directory names to be resolved to the current directory as well as its ancestors, and searched for modules.
     * This functions similarly to how node finds “node_modules” directories.
     * For example, if the value is ["mydir"], webpack will look in “./mydir”, “../mydir”, “../../mydir”, etc.
     */
    modulesDirectories?: string[];
    /**
     * A directory (or array of directories absolute paths),
     * in which webpack should look for modules that weren’t found in resolve.root or resolve.modulesDirectories.
     */
    fallback?: string | string[];
    /**
     * An array of extensions that should be used to resolve modules.
     * For example, in order to discover CoffeeScript files, your array should contain the string ".coffee".
     */
    extensions?: string[];
    /** Check these fields in the package.json for suitable files. */
    packageMains?: (string | string[])[];
    /** Check this field in the package.json for an object. Key-value-pairs are threaded as aliasing according to this spec */
    packageAlias?: (string | string[])[];
    /**
     * Enable aggressive but unsafe caching for the resolving of a part of your files.
     * Changes to cached paths may cause failure (in rare cases). An array of RegExps, only a RegExp or true (all files) is expected.
     * If the resolved path matches, it’ll be cached.
     */
    unsafeCache?: RegExp | RegExp[] | boolean;
}

export interface TSInstance {
    compiler: typeof typescript;
    compilerOptions: typescript.CompilerOptions;
    loaderOptions: LoaderOptions;
    files: TSFiles;
    modifiedFiles?: TSFiles;
    languageService?: typescript.LanguageService;
    version?: number;
    dependencyGraph: DependencyGraph;
    reverseDependencyGraph: ReverseDependencyGraph;
    filesWithErrors?: TSFiles;
}

export interface TSInstances {
    [name: string]: TSInstance;
}

interface DependencyGraph {
    [index: string]: string[];
}

interface ReverseDependencyGraph {
    [index: string]: {
        [index: string]: boolean
    };
}

export interface LoaderOptions {
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

export interface TSFile {
    text: string;
    version: number;
}

export interface TSFiles {
    [fileName: string]: TSFile;
}

export interface ResolvedModule {
    resolvedFileName: string;
    resolvedModule?: ResolvedModule;
    isExternalLibraryImport?: boolean;
}

export interface TSCompatibleCompiler {
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
