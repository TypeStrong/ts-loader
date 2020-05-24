import { Chalk } from 'chalk';
import * as fs from 'fs';
import * as micromatch from 'micromatch';
import * as path from 'path';
import * as typescript from 'typescript';
import * as webpack from 'webpack';

import constants = require('./constants');
import {
  DependencyGraph,
  ErrorInfo,
  LoaderOptions,
  ReverseDependencyGraph,
  Severity,
  TSInstance,
  WebpackError,
  WebpackModule
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

          return Object.assign(error, merge) as WebpackError;
        });
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
  const directDependencies = dependencyGraph[filePath];
  if (directDependencies !== undefined) {
    directDependencies.forEach(dependencyModule => {
      if (!collected[dependencyModule.originalFileName]) {
        collectAllDependencies(
          dependencyGraph,
          dependencyModule.resolvedFileName,
          collected
        ).forEach(depFilePath => (result[depFilePath] = true));
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

export function supportsProjectReferences(instance: TSInstance) {
  const program = ensureProgram(instance);
  return program && !!program.getProjectReferences;
}

export function isUsingProjectReferences(instance: TSInstance) {
  if (
    instance.loaderOptions.projectReferences &&
    supportsProjectReferences(instance)
  ) {
    const program = ensureProgram(instance);
    return Boolean(program && program.getProjectReferences());
  }
  return false;
}

/**
 * Gets the project reference for a file from the cache if it exists,
 * or gets it from TypeScript and caches it otherwise.
 */
export function getAndCacheProjectReference(
  filePath: string,
  instance: TSInstance
) {
  // When using solution builder, dont do the project reference caching
  if (instance.solutionBuilderHost) {
    return undefined;
  }

  const file = instance.files.get(filePath);
  if (file !== undefined && file.projectReference) {
    return file.projectReference.project;
  }

  const projectReference = getProjectReferenceForFile(filePath, instance);
  if (file !== undefined) {
    file.projectReference = { project: projectReference };
  }

  return projectReference;
}

function getResolvedProjectReferences(
  program: typescript.Program
): typescript.ResolvedProjectReference[] | undefined {
  const getProjectReferences =
    (program as any).getResolvedProjectReferences ||
    program.getProjectReferences;
  if (getProjectReferences) {
    return getProjectReferences();
  }
  return;
}

function getProjectReferenceForFile(filePath: string, instance: TSInstance) {
  if (isUsingProjectReferences(instance)) {
    const program = ensureProgram(instance);
    return (
      program &&
      getResolvedProjectReferences(program)!.find(
        ref =>
          (ref &&
            ref.commandLine.fileNames.some(
              file => path.normalize(file) === filePath
            )) ||
          false
      )
    );
  }

  return;
}

export function validateSourceMapOncePerProject(
  instance: TSInstance,
  loader: webpack.loader.LoaderContext,
  jsFileName: string,
  project: typescript.ResolvedProjectReference
) {
  const { projectsMissingSourceMaps = new Set<string>() } = instance;
  if (!projectsMissingSourceMaps.has(project.sourceFile.fileName)) {
    instance.projectsMissingSourceMaps = projectsMissingSourceMaps;
    projectsMissingSourceMaps.add(project.sourceFile.fileName);
    const mapFileName = jsFileName + '.map';
    if (!instance.compiler.sys.fileExists(mapFileName)) {
      const [relativeJSPath, relativeProjectConfigPath] = [
        path.relative(loader.rootContext, jsFileName),
        path.relative(loader.rootContext, project.sourceFile.fileName)
      ];
      loader.emitWarning(
        new Error(
          'Could not find source map file for referenced project output ' +
            `${relativeJSPath}. Ensure the 'sourceMap' compiler option ` +
            `is enabled in ${relativeProjectConfigPath} to ensure Webpack ` +
            'can map project references to the appropriate source files.'
        )
      );
    }
  }
}

export function supportsSolutionBuild(instance: TSInstance) {
  return (
    !!instance.configFilePath &&
    !!instance.loaderOptions.projectReferences &&
    !!instance.compiler.InvalidatedProjectKind &&
    !!instance.configParseResult.projectReferences &&
    !!instance.configParseResult.projectReferences.length
  );
}

/**
 * Gets the output JS file path for an input file governed by a composite project.
 * Pulls from the cache if it exists; computes and caches the result otherwise.
 */
export function getAndCacheOutputJSFileName(
  inputFileName: string,
  projectReference: typescript.ResolvedProjectReference,
  instance: TSInstance
) {
  const file = instance.files.get(inputFileName);
  if (file && file.projectReference && file.projectReference.outputFileName) {
    return file.projectReference.outputFileName;
  }

  const outputFileName = getOutputJavaScriptFileName(
    inputFileName,
    projectReference
  );

  if (file !== undefined) {
    file.projectReference = file.projectReference || {
      project: projectReference
    };
    file.projectReference.outputFileName = outputFileName;
  }

  return outputFileName;
}

// Adapted from https://github.com/Microsoft/TypeScript/blob/45101491c0b077c509b25830ef0ee5f85b293754/src/compiler/tsbuild.ts#L305
function getOutputJavaScriptFileName(
  inputFileName: string,
  projectReference: typescript.ResolvedProjectReference
) {
  const { options } = projectReference.commandLine;
  const projectDirectory =
    options.rootDir || path.dirname(projectReference.sourceFile.fileName);
  const relativePath = path.relative(projectDirectory, inputFileName);
  const outputPath = path.resolve(
    options.outDir || projectDirectory,
    relativePath
  );
  const newExtension = constants.jsonRegex.test(inputFileName)
    ? '.json'
    : constants.tsxRegex.test(inputFileName) &&
      options.jsx === typescript.JsxEmit.Preserve
    ? '.jsx'
    : '.js';
  return outputPath.replace(constants.extensionRegex, newExtension);
}
