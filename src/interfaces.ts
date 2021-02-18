import * as typescript from 'typescript';

import { Chalk } from 'chalk';
import * as logger from './logger';
import * as webpack from 'webpack';

export interface ErrorInfo {
  code: number;
  severity: Severity;
  content: string;
  file: string;
  line: number;
  character: number;
  context: string;
}

export type FileLocation = {
  /** 1-based */
  line: number;
  /** 1-based */
  character: number;
};

export interface HostMayBeCacheable {
  clearCache?(): void;
  fileExistsCache?: Map<string, boolean>;
  directoryExistsCache?: Map<string, boolean>;
  realpathCache?: Map<string, string>;
}

export interface CacheableHost extends HostMayBeCacheable {
  fileExists: typescript.ModuleResolutionHost['fileExists'];
  directoryExists: NonNullable<
    typescript.ModuleResolutionHost['directoryExists']
  >;
  realpath?: typescript.ModuleResolutionHost['realpath'];
}

export interface ModuleResolutionHostMayBeCacheable
  extends typescript.ModuleResolutionHost,
    HostMayBeCacheable {
  readFile(filePath: string, encoding?: string): string | undefined;
  trace: NonNullable<typescript.ModuleResolutionHost['trace']>;
  directoryExists: NonNullable<
    typescript.ModuleResolutionHost['directoryExists']
  >;
  getCurrentDirectory: NonNullable<
    typescript.ModuleResolutionHost['getCurrentDirectory']
  >;
  getDirectories: NonNullable<
    typescript.ModuleResolutionHost['getDirectories']
  >;

  // Other common methods between WatchHost and LanguageServiceHost
  useCaseSensitiveFileNames: NonNullable<
    typescript.LanguageServiceHost['useCaseSensitiveFileNames']
  >;
  getNewLine: NonNullable<typescript.LanguageServiceHost['getNewLine']>;
  getDefaultLibFileName: NonNullable<
    typescript.LanguageServiceHost['getDefaultLibFileName']
  >;
  readDirectory: NonNullable<typescript.LanguageServiceHost['readDirectory']>;
}

export interface ServiceHostWhichMayBeCacheable
  extends typescript.LanguageServiceHost,
    HostMayBeCacheable {}

export interface WatchHost
  extends typescript.WatchCompilerHostOfFilesAndCompilerOptions<typescript.EmitAndSemanticDiagnosticsBuilderProgram> {
  invokeFileWatcher: WatchFactory['invokeFileWatcher'];
  updateRootFileNames(): void;
  outputFiles: Map<FilePathKey, typescript.OutputFile[]>;
  tsbuildinfo?: typescript.OutputFile;
}

export type WatchCallbacks<T> = Map<
  FilePathKey,
  { fileName: string; callbacks: T[] }
>;
export interface WatchFactory {
  watchedFiles: WatchCallbacks<typescript.FileWatcherCallback>;
  watchedDirectories: WatchCallbacks<typescript.DirectoryWatcherCallback>;
  watchedDirectoriesRecursive: WatchCallbacks<typescript.DirectoryWatcherCallback>;
  invokeFileWatcher(
    fileName: string,
    eventKind: typescript.FileWatcherEventKind
  ): boolean;
  /** Used to watch changes in source files, missing files needed to update the program or config file */
  watchFile: typescript.WatchHost['watchFile'];
  /** Used to watch resolved module's failed lookup locations, config file specs, type roots where auto type reference directives are added */
  watchDirectory: typescript.WatchHost['watchDirectory'];
}

export interface SolutionDiagnostics {
  global: typescript.Diagnostic[];
  perFile: Map<FilePathKey, typescript.Diagnostic[]>;
  transpileErrors: [FilePathKey | undefined, typescript.Diagnostic[]][];
}

export type FilePathKey = string & { __filePathKeyBrand: any };

export interface SolutionBuilderWithWatchHost
  extends typescript.SolutionBuilderWithWatchHost<typescript.EmitAndSemanticDiagnosticsBuilderProgram>,
    WatchFactory {
  diagnostics: SolutionDiagnostics;
  writtenFiles: typescript.OutputFile[];
  configFileInfo: Map<FilePathKey, ConfigFileInfo>;
  outputAffectingInstanceVersion: Map<FilePathKey, true>;
  getInputFileStamp(fileName: string): Date;
  updateSolutionBuilderInputFile(fileName: string): void;
  getOutputFileKeyFromReferencedProject(
    outputFileName: string
  ): FilePathKey | undefined;
  getOutputFileAndKeyFromReferencedProject(
    oututFileName: string
  ): { key: FilePathKey; outputFile: string | false } | undefined;
  getOutputFileTextAndKeyFromReferencedProject(
    oututFileName: string
  ): { key: FilePathKey; text: string | undefined } | undefined;
  getInputFileNameFromOutput(outputFileName: string): string | undefined;
  getOutputFilesFromReferencedProjectInput(
    inputFileName: string
  ): typescript.OutputFile[];
  buildReferences(): void;
  ensureAllReferenceTimestamps(): void;
  clearCache(): void;
  close(): void;
}

export interface ConfigFileInfo {
  config: typescript.ParsedCommandLine | undefined;
  outputFileNames?: Map<
    FilePathKey,
    { inputFileName: string; outputNames: string[] }
  >;
  tsbuildInfoFile?: string;
  dtsFiles?: string[];
}

export interface TSInstance {
  compiler: typeof typescript;
  compilerOptions: typescript.CompilerOptions;
  /** Used for Vue for the most part */
  appendTsTsxSuffixesIfRequired: (filePath: string) => string;
  loaderOptions: LoaderOptions;
  rootFileNames: Set<string>;
  /**
   * a cache of all the files
   */
  files: TSFiles;
  /**
   * contains the modified files - cleared each time after-compile is called
   */
  modifiedFiles?: Map<FilePathKey, true>;
  /**
   * Paths to project references that are missing source maps.
   * Cleared each time after-compile is called. Used to dedupe
   * warnings about source maps during a single compilation.
   */
  projectsMissingSourceMaps?: Set<string>;
  servicesHost?: ServiceHostWhichMayBeCacheable;
  languageService?: typescript.LanguageService | null;
  version: number;
  dependencyGraph: DependencyGraph;
  filesWithErrors?: TSFiles;
  transformers: typescript.CustomTransformers;
  colors: Chalk;

  otherFiles: TSFiles;
  watchHost?: WatchHost;
  watchOfFilesAndCompilerOptions?: typescript.WatchOfFilesAndCompilerOptions<typescript.EmitAndSemanticDiagnosticsBuilderProgram>;
  builderProgram?: typescript.EmitAndSemanticDiagnosticsBuilderProgram;
  program?: typescript.Program;
  hasUnaccountedModifiedFiles?: boolean;
  changedFilesList?: boolean;

  reportTranspileErrors?: boolean;
  solutionBuilderHost?: SolutionBuilderWithWatchHost;
  configFilePath: string | undefined;

  filePathKeyMapper: (fileName: string) => FilePathKey;

  initialSetupPending: boolean;
  configParseResult: typescript.ParsedCommandLine;
  log: logger.Logger;
}

export interface LoaderOptionsCache {
  [name: string]: WeakMap<LoaderOptions, LoaderOptions>;
}

export type DependencyGraph = Map<FilePathKey, ResolvedModule[]>;
export type ReverseDependencyGraph = Map<FilePathKey, Map<FilePathKey, true>>;

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export type ResolveModuleName = (
  moduleName: string,
  containingFile: string,
  compilerOptions: typescript.CompilerOptions,
  moduleResolutionHost: typescript.ModuleResolutionHost
) => typescript.ResolvedModuleWithFailedLookupLocations;

export type CustomResolveModuleName = (
  moduleName: string,
  containingFile: string,
  compilerOptions: typescript.CompilerOptions,
  moduleResolutionHost: typescript.ModuleResolutionHost,
  parentResolver: ResolveModuleName
) => typescript.ResolvedModuleWithFailedLookupLocations;

export type CustomResolveTypeReferenceDirective = (
  typeDirectiveName: string,
  containingFile: string,
  compilerOptions: typescript.CompilerOptions,
  moduleResolutionHost: typescript.ModuleResolutionHost,
  parentResolver: typeof typescript.resolveTypeReferenceDirective
) => typescript.ResolvedTypeReferenceDirectiveWithFailedLookupLocations;

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
  appendTsSuffixTo: (RegExp | string)[];
  appendTsxSuffixTo: (RegExp | string)[];
  happyPackMode: boolean;
  getCustomTransformers:
    | string
    | ((
        program: typescript.Program
      ) => typescript.CustomTransformers | undefined);
  experimentalWatchApi: boolean;
  allowTsInNodeModules: boolean;
  experimentalFileCaching: boolean;
  projectReferences: boolean;
  resolveModuleName: CustomResolveModuleName;
  resolveTypeReferenceDirective: CustomResolveTypeReferenceDirective;
  useCaseSensitiveFileNames?: boolean;
}

export interface TSFile {
  fileName: string;
  text?: string;
  version: number;
  modifiedTime?: Date;
  projectReference?: {
    /**
     * Undefined here means we’ve already checked and confirmed there is no
     * project reference for the file. Don’t bother checking again.
     */
    project?: typescript.ResolvedProjectReference;
    outputFileName?: string;
  };
}

/** where key is filepath */
export type TSFiles = Map<FilePathKey, TSFile>;

export interface ResolvedModule {
  originalFileName: string;
  resolvedFileName: string;
  resolvedModule?: ResolvedModule;
  isExternalLibraryImport?: boolean;
}

export type Severity = 'error' | 'warning';

export type WebpackLoaderCallback = (
  err: Error | undefined | null,
  content?: string | Buffer,
  sourceMap?: string | any
) => void;

/** taken from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/9a1a04bc85f4137fbd053e780899526881bdd1ff/types/webpack/index.d.ts#L2222 */
export interface WebpackLoaderContext {
  /**
   * Loader API version. Currently 2.
   * This is useful for providing backwards compatibility.
   * Using the version you can specify custom logic or fallbacks for breaking changes.
   */
  version: string;

  /**
   *  The directory of the module. Can be used as context for resolving other stuff.
   *  In the example: /abc because resource.js is in this directory
   */
  context: string;

  /**
   * Starting with webpack 4, the formerly `this.options.context` is provided as `this.rootContext`.
   */
  rootContext: string;

  /**
   * The resolved request string.
   * In the example: "/abc/loader1.js?xyz!/abc/node_modules/loader2/index.js!/abc/resource.js?rrr"
   */
  request: string;

  /**
   *  A string or any object. The query of the request for the current loader.
   */
  query: any;

  /**
   * A data object shared between the pitch and the normal phase.
   */
  data?: any;

  callback: WebpackLoaderCallback;

  /**
   * Make this loader async.
   */
  async(): WebpackLoaderCallback | undefined;

  /**
   *  Make this loader result cacheable. By default it's not cacheable.
   *  A cacheable loader must have a deterministic result, when inputs and dependencies haven't changed.
   *  This means the loader shouldn't have other dependencies than specified with this.addDependency.
   *  Most loaders are deterministic and cacheable.
   */
  cacheable(flag?: boolean): void;

  /**
   * An array of all the loaders. It is writeable in the pitch phase.
   * loaders = [{request: string, path: string, query: string, module: function}]
   *
   * In the example:
   * [
   *   { request: "/abc/loader1.js?xyz",
   *     path: "/abc/loader1.js",
   *     query: "?xyz",
   *     module: [Function]
   *   },
   *   { request: "/abc/node_modules/loader2/index.js",
   *     path: "/abc/node_modules/loader2/index.js",
   *     query: "",
   *     module: [Function]
   *   }
   * ]
   */
  loaders: any[];

  /**
   * The index in the loaders array of the current loader.
   * In the example: in loader1: 0, in loader2: 1
   */
  loaderIndex: number;

  /**
   * The resource part of the request, including query.
   * In the example: "/abc/resource.js?rrr"
   */
  resource: string;

  /**
   * The resource file.
   * In the example: "/abc/resource.js"
   */
  resourcePath: string;

  /**
   * The query of the resource.
   * In the example: "?rrr"
   */
  resourceQuery: string;

  /**
   * Emit a warning.
   */
  emitWarning(message: string | Error): void;

  /**
   * Emit a error.
   */
  emitError(message: string | Error): void;

  /**
   * Execute some code fragment like a module.
   *
   * Don't use require(this.resourcePath), use this function to make loaders chainable!
   *
   */
  exec(code: string, filename: string): any;

  /**
   * Resolves the given request to a module, applies all configured loaders and calls
   * back with the generated source, the sourceMap and the module instance (usually an
   * instance of NormalModule). Use this function if you need to know the source code
   * of another module to generate the result.
   */
  loadModule(
    request: string,
    callback: (
      err: Error | null,
      source: string,
      sourceMap: any,
      module: webpack.Module
    ) => void
  ): any;

  /**
   * Resolve a request like a require expression.
   */
  resolve(
    context: string,
    request: string,
    callback: (err: Error, result: string) => void
  ): any;

  /**
   * Resolve a request like a require expression.
   */
  resolveSync(context: string, request: string): string;

  /**
   * Adds a file as dependency of the loader result in order to make them watchable.
   * For example, html-loader uses this technique as it finds src and src-set attributes.
   * Then, it sets the url's for those attributes as dependencies of the html file that is parsed.
   */
  addDependency(file: string): void;

  /**
   * Adds a file as dependency of the loader result in order to make them watchable.
   * For example, html-loader uses this technique as it finds src and src-set attributes.
   * Then, it sets the url's for those attributes as dependencies of the html file that is parsed.
   */
  dependency(file: string): void;

  /**
   * Add a directory as dependency of the loader result.
   */
  addContextDependency(directory: string): void;

  /**
   * Remove all dependencies of the loader result. Even initial dependencies and these of other loaders. Consider using pitch.
   */
  clearDependencies(): void;

  /**
   * Pass values to the next loader.
   * If you know what your result exports if executed as module, set this value here (as a only element array).
   */
  value: any;

  /**
   * Passed from the last loader.
   * If you would execute the input argument as module, consider reading this variable for a shortcut (for performance).
   */
  inputValue: any;

  /**
   * A boolean flag. It is set when in debug mode.
   */
  debug: boolean;

  /**
   * Should the result be minimized.
   */
  minimize: boolean;

  /**
   * Should a SourceMap be generated.
   */
  sourceMap: boolean;

  /**
   * Target of compilation. Passed from configuration options.
   * Example values: "web", "node"
   */
  target:
    | 'web'
    | 'webworker'
    | 'async-node'
    | 'node'
    | 'electron-main'
    | 'electron-renderer'
    | 'node-webkit'
    | string;

  /**
   * This boolean is set to true when this is compiled by webpack.
   *
   * Loaders were originally designed to also work as Babel transforms.
   * Therefore if you write a loader that works for both, you can use this property to know if
   * there is access to additional loaderContext and webpack features.
   */
  webpack: boolean;

  /**
   * Emit a file. This is webpack-specific.
   */
  emitFile(name: string, content: Buffer | string, sourceMap: any): void;

  /**
   * Access to the compilation's inputFileSystem property.
   */
  fs: any;

  /**
   * Which mode is webpack running.
   */
  mode: 'production' | 'development' | 'none';

  /**
   * Hacky access to the Compilation object of webpack.
   */
  _compilation: any;

  /**
   * Hacky access to the Compiler object of webpack.
   */
  _compiler: any;

  /**
   * Hacky access to the Module object being loaded.
   */
  _module: any;

  /** Flag if HMR is enabled */
  hot: boolean;
}
