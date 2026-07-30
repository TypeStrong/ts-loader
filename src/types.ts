import type { Colors } from './colors';
import type {
  API as SyncApi,
  CompilerOptions,
  Diagnostic,
  EmitOutput,
  Program,
  Snapshot,
} from 'typescript/unstable/sync';
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

export type FileLocation = {
  line: number;
  character: number;
};

export type FilePathKey = string & { __filePathKeyBrand: unknown };

export type Severity = 'error' | 'warning';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LoaderOptions {
  silent: boolean;
  logLevel: LogLevel;
  logInfoToStdOut: boolean;
  instance: string;
  compiler: string;
  configFile: string;
  context?: string;
  transpileOnly: boolean;
  ignoreDiagnostics: number[];
  reportFiles: string[];
  errorFormatter?: (message: ErrorInfo, colors: Colors) => string;
  onlyCompileBundledFiles: boolean;
  colors: boolean;
  compilerOptions: CompilerOptions;
  appendTsSuffixTo: (RegExp | string)[];
  appendTsxSuffixTo: (RegExp | string)[];
  getCustomTransformers?:
    string | ((program: unknown, getProgram: () => unknown) => unknown);
  experimentalWatchApi: boolean;
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

export type TypeScriptApi = SyncApi;
export type TypeScriptSnapshot = Snapshot;
export type TypeScriptProgram = Program;
export type TypeScriptEmitOutput = EmitOutput;
export type TypeScriptDiagnostic = Diagnostic;
export interface TypeScriptSourceFile {
  getLineAndCharacterOfPosition(position: number): {
    line: number;
    character: number;
  };
}

export interface TypeScriptInstance {
  api: TypeScriptApi;
  configFilePath: string;
  syntheticConfigContents: Map<string, string>;
  syntheticConfigFiles: Map<string, string>;
  openedProjectPaths: Set<string>;
  snapshot?: TypeScriptSnapshot;
}

export interface PendingTypeScriptDiagnostics {
  fileName: string;
  errors: webpack.WebpackError[];
}

export interface PendingDeclarationFile {
  fileName: string;
  text: string;
}

export interface TSInstance {
  version: number;
  colors: Colors;
  loaderOptions: LoaderOptions;
  files: Map<FilePathKey, TSFile>;
  filePathKeyMapper: (fileName: string) => FilePathKey;
  typeScriptApiInstance: TypeScriptInstance;
  pendingDiagnostics: Map<FilePathKey, PendingTypeScriptDiagnostics>;
  pendingDeclarationFiles: Map<FilePathKey, PendingDeclarationFile[]>;
}
