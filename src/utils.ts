import { Chalk } from 'chalk';
import * as fs from 'fs';
import * as micromatch from 'micromatch';
import * as path from 'path';
import * as typescript from 'typescript';

import constants = require('./constants');
import {
  ErrorInfo,
  FilePathKey,
  LoaderOptions,
  ResolvedModule,
  ReverseDependencyGraph,
  Severity,
  TSInstance,
  WebpackError,
  WebpackModule,
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
  merge: { file?: string; module?: WebpackModule },
  context: string
): WebpackError[] {
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
        .map<WebpackError>(diagnostic => {
          const file = diagnostic.file;
          const position =
            file === undefined
              ? undefined
              : file.getLineAndCharacterOfPosition(diagnostic.start!);
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
            line: position === undefined ? 0 : position.line + 1,
            character: position === undefined ? 0 : position.character + 1,
            context,
          };

          const message =
            loaderOptions.errorFormatter === undefined
              ? defaultErrorFormatter(errorInfo, colors)
              : loaderOptions.errorFormatter(errorInfo, colors);

          const error = makeError(
            message,
            merge.file === undefined ? errorInfo.file : merge.file,
            position === undefined
              ? undefined
              : { line: errorInfo.line, character: errorInfo.character }
          );

          return Object.assign(error, merge) as WebpackError;
        });
}

export function fsReadFile(
  fileName: string,
  encoding: string | undefined = 'utf8'
) {
  fileName = path.normalize(fileName);
  try {
    return fs.readFileSync(fileName, encoding);
  } catch (e) {
    return undefined;
  }
}

export function makeError(
  message: string,
  file: string | undefined,
  location?: { line: number; character: number }
): WebpackError {
  return {
    message,
    location,
    file,
    loaderSource: 'ts-loader',
  };
}

export function appendSuffixIfMatch(
  patterns: RegExp[],
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
  suffixDict: { [suffix: string]: RegExp[] },
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

export function ensureTrailingDirectorySeparator<T extends string>(dir: T): T {
  return hasTrailingDirectorySeparator(dir) ? dir : ((dir + '/') as T);
}

function isAnyDirectorySeparator(charCode: number): boolean {
  return (
    charCode === 0x2f || charCode === 0x5c // /
  ); // \
}

function hasTrailingDirectorySeparator(dir: string) {
  return (
    dir.length > 0 && isAnyDirectorySeparator(dir.charCodeAt(dir.length - 1))
  );
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
