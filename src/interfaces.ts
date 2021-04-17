import type * as typescript from 'typescript';

import { Chalk } from 'chalk';
import * as logger from './logger';
import type * as webpack from 'webpack';
import type * as enhancedResolve from 'enhanced-resolve';

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

/** based on https://github.com/webpack/webpack/pull/13164#issuecomment-821357676 */
export interface WebpackLoaderContext {
  version: number;

  /**
   * Hacky access to the Compilation object of webpack.
   */
  _compilation: webpack.Compilation;

  /**
   * Hacky access to the Compiler object of webpack.
   */
  _compiler: webpack.Compiler;

  /**
   * Hacky access to the Module object being loaded.
   */
  _module: webpack.NormalModule;

  addBuildDependency(dep: string): void;

  /**
   * Add a directory as dependency of the loader result.
   * https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L305
   */
  addContextDependency(context: string): void;

  /**
   * Adds a file as dependency of the loader result in order to make them watchable.
   * For example, html-loader uses this technique as it finds src and src-set attributes.
   * Then, it sets the url's for those attributes as dependencies of the html file that is parsed.
   * https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L302
   */
  addDependency(file: string): void;

  /** https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L308 */
  addMissingDependency(context: string): void;

  /**
   * Make this loader async.
   * https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L108
   */
  async(): WebpackLoaderCallback | undefined;

  /**
   * Make this loader result cacheable. By default it's not cacheable.
   * A cacheable loader must have a deterministic result, when inputs and dependencies haven't changed.
   * This means the loader shouldn't have other dependencies than specified with this.addDependency.
   * Most loaders are deterministic and cacheable.
   * https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L297
   */
  cacheable(flag?: boolean): void;

  /** https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L116 */
  callback(): void;

  /**
   * Remove all dependencies of the loader result. Even initial dependencies and these of other loaders. Consider using pitch.
   * https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L320
   */
  clearDependencies(): void;

  /**
   * The directory of the module. Can be used as context for resolving other stuff.
   * eg '/workspaces/ts-loader/examples/vanilla/src'
   * https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L289
   */
  context: string;

  /** https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L358 */
  readonly currentRequest: string;

  /** https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L381 */
  readonly data: any;
  /**
   * alias of addDependency
   * Adds a file as dependency of the loader result in order to make them watchable.
   * For example, html-loader uses this technique as it finds src and src-set attributes.
   * Then, it sets the url's for those attributes as dependencies of the html file that is parsed.
   * https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L302
   */
  dependency(file: string): void;

  /**
   * https://github.com/webpack/webpack/blob/49890b77aae455b3204c17fdbed78eeb47bc1d98/lib/NormalModule.js#L520
   */
  emitError(error: Error | string): void;

  /** https://github.com/webpack/webpack/blob/49890b77aae455b3204c17fdbed78eeb47bc1d98/lib/NormalModule.js#L562 */
  emitFile(
    name: string,
    content: string,
    sourceMap: string,
    assetInfo: webpack.AssetInfo
  ): void;

  /**
   * https://github.com/webpack/webpack/blob/49890b77aae455b3204c17fdbed78eeb47bc1d98/lib/NormalModule.js#L510
   */
  emitWarning(warning: Error | string): void;

  /** https://github.com/webpack/webpack/blob/49890b77aae455b3204c17fdbed78eeb47bc1d98/lib/NormalModule.js#L590 */
  fs: enhancedResolve.CachedInputFileSystem;

  /** https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L314 */
  getContextDependencies(): string[];

  /** https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L311 */
  getDependencies(): string[];

  /** https://github.com/webpack/webpack/blob/49890b77aae455b3204c17fdbed78eeb47bc1d98/lib/NormalModule.js#L530 */
  getLogger(name: string): webpack.Compilation['logger'];

  /** https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L317 */
  getMissingDependencies(): string[];

  /** https://github.com/webpack/webpack/blob/49890b77aae455b3204c17fdbed78eeb47bc1d98/lib/NormalModule.js#L472 */
  getOptions(schema: any): any;

  /** https://github.com/webpack/webpack/blob/49890b77aae455b3204c17fdbed78eeb47bc1d98/lib/NormalModule.js#L541 */
  getResolve(options: webpack.Configuration): any;

  /**
   * The index in the loaders array of the current loader.
   * In the example: in loader1: 0, in loader2: 1
   * https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L290
   */
  loaderIndex: number;

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
  ): void;

  /** https://github.com/webpack/webpack/blob/49890b77aae455b3204c17fdbed78eeb47bc1d98/lib/NormalModule.js#L586 */
  mode: 'development' | 'production' | 'none';

  /** https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L366 */
  readonly previousRequest: any;

  /** https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L374 */
  readonly query: any;

  /** https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L348 */
  readonly remainingRequest: any;

  /** https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L340 */
  readonly request: any;

  /** https://github.com/webpack/webpack/blob/49890b77aae455b3204c17fdbed78eeb47bc1d98/lib/NormalModule.js#L538 */
  resolve(context: string, request: any, callback: any): any;

  /**
   * Starting with webpack 4, the formerly `this.options.context` is provided as `this.rootContext`.
   * https://github.com/webpack/webpack/blob/49890b77aae455b3204c17fdbed78eeb47bc1d98/lib/NormalModule.js#L583
   */
  rootContext: string;

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
   *
   * https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L291
   * https://github.com/webpack/loader-runner/blob/6221befd031563e130f59d171e732950ee4402c6/lib/LoaderRunner.js#L46
   */
  loaders: { request: string }[];

  /**
   * The resource file.
   * In the example: "/abc/resource.js"
   */
  resourcePath: string;
}
