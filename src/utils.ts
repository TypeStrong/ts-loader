import { Chalk } from 'chalk';
import * as fs from 'fs';
import * as micromatch from 'micromatch';
import * as path from 'path';
import * as webpack from 'webpack';
import type * as typescript from 'typescript';

import constants = require('./constants');
import {
  ErrorInfo,
  FileLocation,
  FilePathKey,
  LoaderOptions,
  ResolvedModule,
  ReverseDependencyGraph,
  Severity,
  TSInstance,
} from './interfaces';
import { getInputFileNameFromOutput } from './instances';
/**
 * The default error formatter.
 */
function defaultErrorFormatter(error: ErrorInfo, colors: Chalk) {
  const messageColor =
    error.severity === 'warning' ? colors.bold.yellow : colors.bold.red;

  return (
    colors.grey('[tsl] ') +
    messageColor(error.severity.toUpperCase()) +
    (error.file === ''
      ? ''
      : messageColor(' in ') +
        colors.bold.cyan(`${error.file}(${error.line},${error.character})`)) +
    constants.EOL +
    messageColor(`      TS${error.code}: ${error.content}`)
  );
}

/**
 * Take TypeScript errors, parse them and format to webpack errors
 * Optionally adds a file name
 */
export function formatErrors(
  diagnostics: ReadonlyArray<typescript.Diagnostic> | undefined,
  loaderOptions: LoaderOptions,
  colors: Chalk,
  compiler: typeof typescript,
  merge: { file?: string; module?: webpack.Module },
  context: string
): webpack.WebpackError[] {
  return diagnostics === undefined
    ? []
    : diagnostics
        .filter(diagnostic => {
          if (loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) !== -1) {
            return false;
          }
          if (
            loaderOptions.reportFiles.length > 0 &&
            diagnostic.file !== undefined
          ) {
            const relativeFileName = path.relative(
              context,
              diagnostic.file.fileName
            );
            const matchResult = micromatch(
              [relativeFileName],
              loaderOptions.reportFiles
            );
            if (matchResult.length === 0) {
              return false;
            }
          }
          return true;
        })
        .map<webpack.WebpackError>(diagnostic => {
          const file = diagnostic.file;
          const { start, end } =
            file === undefined || diagnostic.start === undefined
              ? { start: undefined, end: undefined }
              : getFileLocations(file, diagnostic.start, diagnostic.length);
          const errorInfo: ErrorInfo = {
            code: diagnostic.code,
            severity: compiler.DiagnosticCategory[
              diagnostic.category
            ].toLowerCase() as Severity,
            content: compiler.flattenDiagnosticMessageText(
              diagnostic.messageText,
              constants.EOL
            ),
            file: file === undefined ? '' : path.normalize(file.fileName),
            line: start === undefined ? 0 : start.line,
            character: start === undefined ? 0 : start.character,
            context,
          };

          const message =
            loaderOptions.errorFormatter === undefined
              ? defaultErrorFormatter(errorInfo, colors)
              : loaderOptions.errorFormatter(errorInfo, colors);

          const error = makeError(
            loaderOptions,
            message,
            merge.file === undefined ? errorInfo.file : merge.file,
            start,
            end
          );

          return Object.assign(error, merge) as webpack.WebpackError;
        });
}

function getFileLocations(
  file: typescript.SourceFile,
  position: number,
  length = 0
) {
  const startLC = file.getLineAndCharacterOfPosition(position);
  const start: FileLocation = {
    line: startLC.line + 1,
    character: startLC.character + 1,
  };
  const endLC =
    length > 0
      ? file.getLineAndCharacterOfPosition(position + length)
      : undefined;
  const end: FileLocation | undefined =
    endLC === undefined
      ? undefined
      : { line: endLC.line + 1, character: endLC.character + 1 };
  return { start, end };
}

export function fsReadFile(
  fileName: string,
  encoding: BufferEncoding | undefined = 'utf8'
) {
  fileName = path.normalize(fileName);
  try {
    return fs.readFileSync(fileName, encoding);
  } catch (e) {
    return undefined;
  }
}

export function makeError(
  loaderOptions: LoaderOptions,
  message: string,
  file: string,
  location?: FileLocation,
  endLocation?: FileLocation
): webpack.WebpackError {
  const error = new webpack.WebpackError(message);
  error.file = file;
  error.loc =
    location === undefined
      ? { name: file }
      : makeWebpackLocation(location, endLocation);
  error.details = tsLoaderSource(loaderOptions);

  return error;

  // return {
  //   message,
  //   file,
  //   loc:
  //     location === undefined
  //       ? { name: file }
  //       : makeWebpackLocation(location, endLocation),
  //   details: tsLoaderSource(loaderOptions),
  // };
}

/** Not exported from webpack so declared locally */
interface WebpackSourcePosition {
  line: number;
  column?: number;
}

function makeWebpackLocation(
  location: FileLocation,
  endLocation?: FileLocation
) {
  const start: WebpackSourcePosition = {
    line: location.line,
    column: location.character - 1,
  };
  const end: WebpackSourcePosition | undefined =
    endLocation === undefined
      ? undefined
      : { line: endLocation.line, column: endLocation.character - 1 };
  return { start, end };
}

export function tsLoaderSource(loaderOptions: LoaderOptions) {
  return `ts-loader-${loaderOptions.instance}`;
}

export function appendSuffixIfMatch(
  patterns: (RegExp | string)[],
  filePath: string,
  suffix: string
): string {
  if (patterns.length > 0) {
    for (const regexp of patterns) {
      if (filePath.match(regexp) !== null) {
        return filePath + suffix;
      }
    }
  }
  return filePath;
}

export function appendSuffixesIfMatch(
  suffixDict: { [suffix: string]: (RegExp | string)[] },
  filePath: string
): string {
  let amendedPath = filePath;
  for (const suffix in suffixDict) {
    amendedPath = appendSuffixIfMatch(suffixDict[suffix], amendedPath, suffix);
  }
  return amendedPath;
}

export function unorderedRemoveItem<T>(array: T[], item: T): boolean {
  for (let i = 0; i < array.length; i++) {
    if (array[i] === item) {
      // Fill in the "hole" left at `index`.
      array[i] = array[array.length - 1];
      array.pop();
      return true;
    }
  }
  return false;
}

export function populateDependencyGraph(
  resolvedModules: ResolvedModule[],
  instance: TSInstance,
  containingFile: string
) {
  resolvedModules = resolvedModules.filter(
    mod => mod !== null && mod !== undefined
  );
  if (resolvedModules.length) {
    const containingFileKey = instance.filePathKeyMapper(containingFile);
    instance.dependencyGraph.set(containingFileKey, resolvedModules);
  }
}

export function populateReverseDependencyGraph(instance: TSInstance) {
  const reverseDependencyGraph: ReverseDependencyGraph = new Map();
  for (const [fileKey, resolvedModules] of instance.dependencyGraph.entries()) {
    const inputFileName =
      instance.solutionBuilderHost &&
      getInputFileNameFromOutput(instance, fileKey);
    const containingFileKey = inputFileName
      ? instance.filePathKeyMapper(inputFileName)
      : fileKey;
    resolvedModules.forEach(({ resolvedFileName }) => {
      const key = instance.filePathKeyMapper(
        instance.solutionBuilderHost
          ? getInputFileNameFromOutput(instance, resolvedFileName) ||
              resolvedFileName
          : resolvedFileName
      );
      let map = reverseDependencyGraph.get(key);
      if (!map) {
        map = new Map();
        reverseDependencyGraph.set(key, map);
      }
      map.set(containingFileKey, true);
    });
  }
  return reverseDependencyGraph;
}

/**
 * Recursively collect all possible dependants of passed file
 */
export function collectAllDependants(
  reverseDependencyGraph: ReverseDependencyGraph,
  fileName: FilePathKey,
  result: Map<FilePathKey, true> = new Map()
): Map<FilePathKey, true> {
  result.set(fileName, true);
  const dependants = reverseDependencyGraph.get(fileName);
  if (dependants !== undefined) {
    for (const dependantFileName of dependants.keys()) {
      if (!result.has(dependantFileName)) {
        collectAllDependants(reverseDependencyGraph, dependantFileName, result);
      }
    }
  }
  return result;
}

export function arrify<T>(val: T | T[]) {
  if (val === null || val === undefined) {
    return [];
  }

  return Array.isArray(val) ? val : [val];
}

export function ensureProgram(instance: TSInstance) {
  if (instance && instance.watchHost) {
    if (instance.hasUnaccountedModifiedFiles) {
      if (instance.changedFilesList) {
        instance.watchHost.updateRootFileNames();
      }
      if (instance.watchOfFilesAndCompilerOptions) {
        instance.builderProgram = instance.watchOfFilesAndCompilerOptions.getProgram();
        instance.program = instance.builderProgram.getProgram();
      }
      instance.hasUnaccountedModifiedFiles = false;
    }
    return instance.program;
  }
  if (instance.languageService) {
    return instance.languageService.getProgram();
  }
  return instance.program;
}

export function supportsSolutionBuild(instance: TSInstance) {
  return (
    !!instance.configFilePath &&
    !!instance.loaderOptions.projectReferences &&
    !!instance.configParseResult.projectReferences &&
    !!instance.configParseResult.projectReferences.length
  );
}

export function isReferencedFile(instance: TSInstance, filePath: string) {
  return (
    !!instance.solutionBuilderHost &&
    !!instance.solutionBuilderHost.watchedFiles.get(
      instance.filePathKeyMapper(filePath)
    )
  );
}

export function useCaseSensitiveFileNames(
  compiler: typeof typescript,
  loaderOptions: LoaderOptions
) {
  return loaderOptions.useCaseSensitiveFileNames !== undefined
    ? loaderOptions.useCaseSensitiveFileNames
    : compiler.sys.useCaseSensitiveFileNames;
}
