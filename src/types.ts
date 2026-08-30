import type { Colors } from './colors';
import type { API as SyncApi, Snapshot } from 'typescript/unstable/sync';
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
 * FilePathKey is a branded type for file paths, ensuring that they are treated 
 * as unique keys in maps and caches. This helps prevent accidental mixing of 
 * different types of strings and provides better type safety when working with 
 * file paths in the TypeScript loader context.
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
  resolveModuleName?: (...args: unknown[]) => unknown;
  resolveTypeReferenceDirective?: (...args: unknown[]) => unknown;
  useCaseSensitiveFileNames?: boolean;
}

export interface LoaderOptionsCache {
  [name: string]: WeakMap<LoaderOptions, LoaderOptions>;
}

export interface TSFile {
  fileName: string;
  text?: string;
  version: number;
}

export interface TypeScriptInstance {
  api: SyncApi;
  /**
   * Stored so functions that only receive a `TypeScriptInstance` (not the
   * outer `TSInstance` - openPrimaryProject, prepareSnapshotForFile,
   * ensureSyntheticConfigForFile, updateSnapshot) can still canonicalize a
   * path into a `FilePath` without threading it through as a separate
   * parameter everywhere.
   */
  resolvedPathCache: ResolvedPathCache;
  configFilePath: FilePath;
  syntheticConfigContents: Map<FilePath, string>;
  /** Orphan file (see ensureSyntheticConfigForFile) -> its synthetic project's config path. */
  syntheticConfigFiles: Map<FilePath, FilePath>;
  openedProjectPaths: Set<FilePath>;
  snapshot?: Snapshot;
  /**
   * Set on creation and by webpack's `compile` hook (once per build/watch
   * rebuild) - see `updateSnapshot`. Consumed (and cleared) by the first
   * `updateSnapshot` call of that build, so only that call forces the API to
   * discard its caches and rescan disk; every other file compiled within the
   * same build reuses the now-fresh snapshot instead of rescanning again.
   */
  pendingInvalidation: boolean;
  /**
   * Memoizes each project file's direct resolved relative imports (see
   * getDirectResolvedImports) across every file compiled in the same build -
   * findTransitiveDependants's dependant search otherwise recomputes this
   * from scratch for every project file on every single compile. Cleared
   * whenever `pendingInvalidation` forces a real rescan (see updateSnapshot),
   * since only then could another file's content have changed on disk.
   *
   * Keyed by `FilePathKey` (via `ResolvedPathCache`), not a raw file name -
   * the API returns forward-slash-normalized names while webpack/loader
   * paths are OS-native, so two spellings of the same file would otherwise
   * never share a cache entry.
   */
  directImportsCache: Map<FilePath, readonly string[]>;
  /**
   * Memoizes each project's qualifying `.d.ts` file names (see
   * registerTypeScriptDependencies) across every file compiled in the same
   * build, keyed by project config path - registerTypeScriptDependencies
   * otherwise rescans every file in the program on every single compile just
   * to find these. Cleared whenever `pendingInvalidation` forces a real
   * rescan (see updateSnapshot), since only then could the project's file set
   * have changed. Keyed by project (primary vs a synthetic one-off project
   * for an orphan file - see ensureSyntheticConfigForFile) rather than a
   * single shared list, since their file sets are unrelated. Keyed via
   * `FilePathKey` (like `directImportsCache`) for consistency, though project
   * config paths are already stable, single-sourced strings in practice.
   */
  projectDtsFileNamesCache: Map<FilePath, readonly string[]>;
}

interface PendingTypeScriptDiagnostics {
  fileName: string;
  errors: webpack.WebpackError[];
}

export interface PendingDeclarationFile {
  fileName: string;
  text: string;
}

export interface ResolvedPathCache {
  (fileName: string): FilePath;
}

export interface TSInstance {
  version: number;
  colors: Colors;
  loaderOptions: LoaderOptions;
  files: Map<FilePath, TSFile>;
  resolvedPathCache: ResolvedPathCache;
  typeScriptApiInstance: TypeScriptInstance;
  pendingDiagnostics: Map<FilePath, PendingTypeScriptDiagnostics>;
  pendingDeclarationFiles: Map<FilePath, PendingDeclarationFile[]>;
}
