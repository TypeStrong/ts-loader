import type { Colors } from './colors';
import type {
  API,
  CompilerOptions,
  Diagnostic,
  ModuleResolver,
  ParsedCommandLine,
  ResolveModuleNameResult,
  Snapshot,
  SyntheticProjectId,
} from 'typescript/sync';
import type * as webpack from 'webpack';

export interface ErrorInfo {
  code: number;
  severity: Severity;
  content: string;
  file: string;
  line: number;
  character: number;
  context: string;
}

export interface FileLocation {
  line: number;
  character: number;
}

/**
 * A canonical map key from `resolvedFilePathCache`: resolved, and lowercased
 * on case-insensitive filesystems. Not for passing to the API (see
 * `TypeScriptInstance.configFilePath`).
 */
export type FilePath = string & { __filePathBrandedType: unknown };

export type Severity = 'error' | 'warning';

export const LogLevel = {
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

export interface LoaderOptions {
  silent: boolean;
  logLevel: keyof typeof LogLevel;
  logInfoToStdOut: boolean;
  instance: string;
  compiler: string;
  configFile: string;
  transpileOnly: boolean;
  ignoreDiagnostics: number[];
  reportFiles: string[];
  errorFormatter?: (message: ErrorInfo, colors: Colors) => string;
  colors: boolean;
  appendTsSuffixTo: (RegExp | string)[];
  appendTsxSuffixTo: (RegExp | string)[];
  getCustomTransformers?:
    string | ((program: unknown, getProgram: () => unknown) => unknown);
  allowTsInNodeModules: boolean;
  projectReferences?: boolean;
  resolveModuleName?: CustomResolveModuleName;
  resolveTypeReferenceDirective?: (...args: unknown[]) => unknown;
  useCaseSensitiveFileNames?: boolean;
}

export interface ParentModuleResolver {
  (moduleName: string, containingFile: string): ResolveModuleNameResult;
}

/**
 * Classic ts-loader's signature. `containingFile` is a placeholder in the
 * right directory (the API doesn't say which file is importing), and there's
 * no `compilerHost`.
 */
export interface CustomResolveModuleName {
  (
    moduleName: string,
    containingFile: string,
    compilerOptions: CompilerOptions,
    compilerHost: undefined,
    parentResolver: ParentModuleResolver,
  ): ResolveModuleNameResult | undefined;
}

export interface LoaderOptionsCache {
  [name: string]: WeakMap<LoaderOptions, LoaderOptions>;
}

export interface TSFile {
  fileName: string;
  text?: string;
  version: number;
}

export interface SyntheticProgram {
  id: SyntheticProjectId;
  /**
   * The root files/options it was last (re)configured with, serialized - a
   * mismatch against the current ones means it needs reconfiguring.
   */
  configuration: string;
}

export interface TypeScriptInstance {
  api: API;
  /** Real-cased, as given to the API - not a canonical key (see FilePath). */
  configFilePath: string;
  transpileConfig?: ParsedCommandLine;
  transpileConfigDiagnostics?: readonly Diagnostic[];
  transpileConfigDiagnosticsReported?: boolean;
  /**
   * The current snapshot, refreshed by updateSnapshot and layered onto per
   * file by layerFileContents.
   */
  snapshot?: Snapshot;
  /** The one synthetic program shared by every orphan file - see ensureOrphanProgram. */
  orphanProgram?: SyntheticProgram;
  /**
   * Orphan files that had to be added to `orphanProgram` as extra roots,
   * canonical key -> api-facing name.
   */
  orphanRootFileNames: Map<FilePath, string>;
  primaryProjectOpened: boolean;
  /**
   * Forces a full rescan (`invalidateAll`) on the first updateSnapshot of a
   * build. Set on creation and by the `compile` hook when webpack can't say
   * what changed (first build, webpack 4).
   */
  pendingInvalidation: boolean;
  /**
   * Webpack 5 watcher's changed files since the last build, set by the
   * `compile` hook - a cheaper, targeted alternative to `pendingInvalidation`
   * that lets `directImportsCache` survive. Consumed by the first
   * updateSnapshot of a build.
   */
  pendingChangedFiles?: ReadonlySet<string>;
  pendingRemovedFiles?: ReadonlySet<string>;
  /**
   * Each project file's direct resolved imports (see getDirectResolvedImports),
   * kept across builds and pruned by updateSnapshot.
   */
  directImportsCache: Map<FilePath, readonly string[]>;
  /** Keyed by project (primary or orphan program) - see getProjectFileNames. */
  projectFileNamesCache: Map<
    FilePath,
    { sourceFileNames: readonly string[]; result: readonly string[] }
  >;
  /**
   * Api-facing names of files compiled this build, consumed by
   * recheckAllTransitiveDependants at the end of the build.
   */
  changedFilesThisBuild: Set<string>;
  /**
   * Every file webpack's watcher reported changed or removed since the last
   * recheckAllTransitiveDependants - unlike `pendingChangedFiles`/
   * `pendingRemovedFiles`, not consumed by the first compile of a build, so
   * the end-of-build recheck can see files no loader call ever touches.
   * `undefined` when webpack can't say (the first build, or webpack 4): every
   * unbundled project file is rechecked then.
   */
  watcherChangedFiles: Set<string> | undefined;
  customResolveModuleName?: CustomResolveModuleName;
  /** See getCustomModuleResolver. */
  customModuleResolver?: { resolver: ModuleResolver; configuration: string };
}

interface PendingTypeScriptDiagnostics {
  fileName: string;
  errors: webpack.WebpackError[];
}

export interface PendingDeclarationFile {
  fileName: string;
  text: string;
}

export interface ResolvedFilePathCache {
  (fileName: string): FilePath;
}

export interface TSInstance {
  version: number;
  colors: Colors;
  loaderOptions: LoaderOptions;
  files: Map<FilePath, TSFile>;
  resolvedFilePathCache: ResolvedFilePathCache;
  typeScriptApiInstance: TypeScriptInstance;
  pendingDiagnostics: Map<FilePath, PendingTypeScriptDiagnostics>;
  pendingDeclarationFiles: Map<FilePath, PendingDeclarationFile[]>;
}
