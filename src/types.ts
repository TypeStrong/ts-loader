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
   * Set by webpack's `compile` hook (once per build/watch rebuild) from
   * `compiler.modifiedFiles`/`removedFiles` (webpack 5 only, and only once
   * watching has actually started - both are `undefined` for the first
   * build) - see `updateSnapshot`. A targeted alternative to
   * `pendingInvalidation`: webpack's own watcher already knows exactly which
   * files changed since the last build, so listing them is both sufficient
   * (matches what `pendingInvalidation`'s full `invalidateAll` was
   * conservatively guessing at) and far cheaper - it lets `directImportsCache`
   * survive across builds instead of being discarded and rebuilt from
   * scratch every single time. Consumed (and cleared) by the first
   * `updateSnapshot` call of the build, same as `pendingInvalidation`; when
   * neither this nor `pendingRemovedFiles` is set (webpack 4, or the very
   * first build), `pendingInvalidation` is used instead.
   */
  pendingChangedFiles?: ReadonlySet<string>;
  /** Removed-file counterpart to `pendingChangedFiles` - see there. */
  pendingRemovedFiles?: ReadonlySet<string>;
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
   * Self-validating memo of each project's non-default-lib,
   * non-external-library source file names (see `getProjectFileNames`,
   * `getProjectDtsFileNames`, `registerTypeScriptDependencies`, and
   * `recheckAllTransitiveDependants`), keyed by project config path.
   * Classifying every file in the program via
   * `isSourceFileDefaultLibrary`/`isSourceFileFromExternalLibrary` is a round
   * trip per file per call, so recomputing this on every compile/recheck (as
   * an earlier version did) turns a whole-project scan into two extra round
   * trips per file, every single time. Unlike `directImportsCache` (cleared
   * whenever content might have changed - see `pendingInvalidation`), this
   * cache stores the exact `program.getSourceFileNames()` list it was
   * computed against and is safe to keep across builds indefinitely: a
   * content-only edit never changes that list, so the vast majority of
   * lookups are a free comparison against an unchanged list; a genuine
   * project file addition/removal changes the list, which
   * `getProjectFileNames` detects itself (no external invalidation signal
   * needed) and reclassifies. Keyed by project (primary vs a synthetic
   * one-off project for an orphan file - see ensureSyntheticConfigForFile)
   * rather than a single shared list, since their file sets are unrelated.
   * Keyed via `FilePathKey` (like `directImportsCache`) for consistency,
   * though project config paths are already stable, single-sourced strings
   * in practice.
   */
  projectFileNamesCache: Map<
    FilePath,
    { sourceFileNames: readonly string[]; result: readonly string[] }
  >;
  /**
   * Api-facing names (see toApiFacingFileName) of every primary-project file
   * compiled so far in the current build/watch rebuild - accumulated by
   * getTypeScriptEmit, consumed once (and cleared) by
   * recheckAllTransitiveDependants at the end of the build. Batches the
   * transitive-dependant recheck into a single pass over the whole changed
   * set instead of one pass per compiled file, which otherwise turns into
   * O(files compiled Ă— dependants per file) redundant work - see
   * recheckAllTransitiveDependants's comment.
   */
  changedFilesThisBuild: Set<string>;
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
