import type { Chalk } from 'chalk';
import type {
  API as SyncApi,
  CompilerOptions,
  Diagnostic,
  EmitOutput,
  Program,
  Snapshot,
} from 'typescript/unstable/sync';

import type { Logger } from './logger';

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
  errorFormatter?: (message: ErrorInfo, colors: Chalk) => string;
  onlyCompileBundledFiles: boolean;
  colors: boolean;
  compilerOptions: CompilerOptions;
  appendTsSuffixTo: (RegExp | string)[];
  appendTsxSuffixTo: (RegExp | string)[];
  getCustomTransformers?:
    | string
    | ((program: unknown, getProgram: () => unknown) => unknown);
  experimentalWatchApi: boolean;
  allowTsInNodeModules: boolean;
  experimentalFileCaching: boolean;
  projectReferences?: boolean;
  resolveModuleName?: (...args: unknown[]) => unknown;
  resolveTypeReferenceDirective?: (...args: unknown[]) => unknown;
  useCaseSensitiveFileNames?: boolean;
  experimentalNativeApi: boolean;
}

export interface LoaderOptionsCache {
  [name: string]: WeakMap<LoaderOptions, LoaderOptions>;
}

export interface TSFile {
  fileName: string;
  text?: string;
  version: number;
}

export type NativeApi = SyncApi;
export type NativeSnapshot = Snapshot;
export type NativeProgram = Program;
export type NativeEmitOutput = EmitOutput;
export type NativeDiagnostic = Diagnostic;
export interface NativeSourceFile {
  getLineAndCharacterOfPosition(
    position: number
  ): { line: number; character: number };
}

export interface NativeInstance {
  api: NativeApi;
  configFilePath: string;
  syntheticConfigFiles: Map<string, string>;
  openedProjectPaths: Set<string>;
  snapshot?: NativeSnapshot;
}

export interface TSInstance {
  version: number;
  colors: Chalk;
  log: Logger;
  loaderOptions: LoaderOptions;
  files: Map<FilePathKey, TSFile>;
  configFilePath: string;
  filePathKeyMapper: (fileName: string) => FilePathKey;
  nativeInstance: NativeInstance;
}
