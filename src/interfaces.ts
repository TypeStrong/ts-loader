import * as typescript from 'typescript';
import { Chalk } from 'chalk';

export interface SourceMap {
  sources: any[];
  file: string;
  sourcesContent: string[];
}

export interface ErrorInfo {
  code: number;
  severity: Severity;
  content: string;
  file: string;
  line: number;
  character: number;
}

export interface AsyncCallback {
  (err: Error | WebpackError | null, source?: string, map?: string): void;
}

/**
 * Details here: https://webpack.github.io/docs/loaders.html#loader-context
 */
export interface Webpack {
  _compiler: Compiler;
  _module: WebpackModule;
  /**
   * Make this loader result cacheable. By default it’s not cacheable.
   *
   * A cacheable loader must have a deterministic result, when inputs and dependencies haven’t changed. This means the loader shouldn’t have other dependencies than specified with this.addDependency. Most loaders are deterministic and cacheable.
   */
  cacheable: () => void;
  /**
   * The directory of the module. Can be used as context for resolving other stuff.
   */
  context: string;
  /**
   * The resolved request string.
   * eg: "/abc/loader1.js?xyz!/abc/node_modules/loader2/index.js!/abc/resource.js?rrr"
   */
  request: string;
  /**
   * The query of the request for the current loader.
   */
  query: string;
  /**
   * A data object shared between the pitch and the normal phase.
   */
  data: Object;
  async: () => AsyncCallback;
  /**
   * The resource part of the request, including query.
   * eg: "/abc/resource.js?rrr"
   */
  resource: string;
  /**
   * The resource file.
   * eg: "/abc/resource.js"
   */
  resourcePath: string;
  /**
   * The query of the resource.
   * eg: "?rrr"
   */
  resourceQuery: string;
  /**
   * Resolve a request like a require expression.
   */
  resolve: (
    context: string,
    request: string,
    callback: (err: Error, result: string) => void
  ) => void;
  /**
   * Resolve a request like a require expression.
   */
  resolveSync: (context: string, request: string) => string;
  /**
   * Add a file as dependency of the loader result in order to make them watchable.
   */
  addDependency: (file: string) => void;
  /**
   * Add a directory as dependency of the loader result.
   */
  addContextDependency: (directory: string) => void;
  /**
   * Remove all dependencies of the loader result. Even initial dependencies and these of other loaders. Consider using pitch.
   */
  clearDependencies: () => void;
  /**
   * Emit a warning.
   */
  emitWarning: (message: string) => void;
  /**
   * Emit an error.
   */
  emitError: (message: string) => void;
  /**
   * Emit a file. This is webpack-specific
   */
  emitFile: (fileName: string, text: string) => void; // unused
}

export interface Compiler {
  plugin: (name: string, callback: Function) => void;

  hooks: any; // TODO: Define this

  /**
   * The options passed to the Compiler.
   */
  options: {
    resolve: Resolve;
  };
}

export type FileLocation = { line: number; character: number };

export interface WebpackError {
  module?: any;
  file?: string;
  message: string;
  location?: FileLocation;
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
    };
  };
}

/**
 * webpack/lib/Compiler.js
 */
export interface WebpackCompiler {
  isChild(): boolean;
  context: string; // a guess
  watchFileSystem: WebpackNodeWatchFileSystem;
  /** key is filepath and value is Date as a number */
  fileTimestamps: Map<string, number>;
}

export interface WebpackModule {
  resource: string;
  errors: WebpackError[];
  buildMeta: {
    tsLoaderFileVersion: number;
    tsLoaderDefinitionFileVersions: string[];
  };
}

export interface Watcher {
  getTimes(): { [filePath: string]: number };
}

export interface WebpackNodeWatchFileSystem {
  watcher?: Watcher;
  wfs?: {
    watcher: Watcher;
  };
}

export interface Resolve {
  /** Replace modules by other modules or paths. */
  alias?: { [key: string]: string };
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

export interface ResolveSync {
  (context: string | undefined, path: string, moduleName: string): string;
}

export interface ModuleResolutionHost {
  fileExists(fileName: string): boolean;
  readFile(fileName: string, encoding?: string | undefined): string | undefined;
}

export interface WatchHost
  extends typescript.WatchCompilerHostOfFilesAndCompilerOptions<
      typescript.BuilderProgram
    > {
  invokeFileWatcher(
    fileName: string,
    eventKind: typescript.FileWatcherEventKind
  ): void;
  invokeDirectoryWatcher(directory: string, fileAddedOrRemoved: string): void;
  updateRootFileNames(): void;
}

export interface TSInstance {
  compiler: typeof typescript;
  compilerOptions: typescript.CompilerOptions;
  loaderOptions: LoaderOptions;
  /**
   * a cache of all the files
   */
  files: TSFiles;
  /**
   * contains the modified files - cleared each time after-compile is called
   */
  modifiedFiles?: TSFiles | null;
  languageService?: typescript.LanguageService | null;
  version?: number;
  dependencyGraph: DependencyGraph;
  reverseDependencyGraph: ReverseDependencyGraph;
  filesWithErrors?: TSFiles;
  transformers: typescript.CustomTransformers;
  colors: Chalk;

  otherFiles: TSFiles;
  watchHost?: WatchHost;
  watchOfFilesAndCompilerOptions?: typescript.WatchOfFilesAndCompilerOptions<
    typescript.BuilderProgram
  >;
  program?: typescript.Program;
  hasUnaccountedModifiedFiles?: boolean;
  changedFilesList?: boolean;
}

export interface LoaderOptionsCache {
  [name: string]: LoaderOptions;
}

export interface TSInstances {
  [name: string]: TSInstance;
}

export interface DependencyGraph {
  [file: string]: ResolvedModule[] | undefined;
}

export interface ReverseDependencyGraph {
  [file: string]:
    | {
        [file: string]: boolean;
      }
    | undefined;
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LoaderOptions {
  silent: boolean;
  logLevel: LogLevel;
  logInfoToStdOut: boolean;
  instance: string;
  compiler: string;
  configFile: string;
  context: string;
  transpileOnly: boolean;
  ignoreDiagnostics: number[];
  reportFiles: string[];
  errorFormatter: (message: ErrorInfo, colors: Chalk) => string;
  onlyCompileBundledFiles: boolean;
  colors: boolean;
  compilerOptions: typescript.CompilerOptions;
  appendTsSuffixTo: RegExp[];
  appendTsxSuffixTo: RegExp[];
  happyPackMode: boolean;
  getCustomTransformers?(): typescript.CustomTransformers | undefined;
  experimentalWatchApi: boolean;
}

export interface TSFile {
  text?: string;
  version: number;
}

/** where key is filepath */
export type TSFiles = Map<string, TSFile>;

export interface ResolvedModule {
  originalFileName: string;
  resolvedFileName: string;
  resolvedModule?: ResolvedModule;
  isExternalLibraryImport?: boolean;
}

export type Severity = 'error' | 'warning';
