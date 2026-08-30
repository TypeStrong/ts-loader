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

export type FilePathKey = string & { __filePathKeyBrand: unknown };

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
  configFilePath: string;
  syntheticConfigContents: Map<string, string>;
  syntheticConfigFiles: Map<string, string>;
  openedProjectPaths: Set<string>;
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
   */
  directImportsCache: Map<string, readonly string[]>;
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
  (fileName: string): FilePathKey;
}

export interface TSInstance {
  version: number;
  colors: Colors;
  loaderOptions: LoaderOptions;
  files: Map<FilePathKey, TSFile>;
  resolvedPathCache: ResolvedPathCache;
  typeScriptApiInstance: TypeScriptInstance;
  pendingDiagnostics: Map<FilePathKey, PendingTypeScriptDiagnostics>;
  pendingDeclarationFiles: Map<FilePathKey, PendingDeclarationFile[]>;
}
