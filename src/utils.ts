import * as typescript from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { Chalk } from 'chalk';
import * as micromatch from 'micromatch';

import constants = require('./constants');
import {
  DependencyGraph,
  LoaderOptions,
  ReverseDependencyGraph,
  Severity,
  WebpackError,
  WebpackModule,
  ErrorInfo
} from './interfaces';

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
  return diagnostics
    ? diagnostics
        .filter(diagnostic => {
          if (loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) !== -1) {
            return false;
          }
          if (loaderOptions.reportFiles.length > 0 && diagnostic.file) {
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
            context
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

          return <WebpackError>Object.assign(error, merge);
        })
    : [];
}

export function readFile(
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
    loaderSource: 'ts-loader'
  };
}

export function appendSuffixIfMatch(
  patterns: RegExp[],
  path: string,
  suffix: string
): string {
  if (patterns.length > 0) {
    for (let regexp of patterns) {
      if (path.match(regexp)) {
        return path + suffix;
      }
    }
  }
  return path;
}

export function appendSuffixesIfMatch(
  suffixDict: { [suffix: string]: RegExp[] },
  path: string
): string {
  for (let suffix in suffixDict) {
    path = appendSuffixIfMatch(suffixDict[suffix], path, suffix);
  }
  return path;
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

/**
 * Recursively collect all possible dependants of passed file
 */
export function collectAllDependants(
  reverseDependencyGraph: ReverseDependencyGraph,
  fileName: string,
  collected: { [file: string]: boolean } = {}
): string[] {
  const result = {};
  result[fileName] = true;
  collected[fileName] = true;
  const dependants = reverseDependencyGraph[fileName];
  if (dependants !== undefined) {
    Object.keys(dependants).forEach(dependantFileName => {
      if (!collected[dependantFileName]) {
        collectAllDependants(
          reverseDependencyGraph,
          dependantFileName,
          collected
        ).forEach(fName => (result[fName] = true));
      }
    });
  }
  return Object.keys(result);
}

/**
 * Recursively collect all possible dependencies of passed file
 */
export function collectAllDependencies(
  dependencyGraph: DependencyGraph,
  filePath: string,
  collected: { [file: string]: boolean } = {}
): string[] {
  const result = {};
  result[filePath] = true;
  collected[filePath] = true;
  let directDependencies = dependencyGraph[filePath];
  if (directDependencies !== undefined) {
    directDependencies.forEach(dependencyModule => {
      if (!collected[dependencyModule.originalFileName]) {
        collectAllDependencies(
          dependencyGraph,
          dependencyModule.resolvedFileName,
          collected
        ).forEach(filePath => (result[filePath] = true));
      }
    });
  }
  return Object.keys(result);
}

export function arrify<T>(val: T | T[]) {
  if (val === null || val === undefined) {
    return [];
  }

  return Array.isArray(val) ? val : [val];
}
