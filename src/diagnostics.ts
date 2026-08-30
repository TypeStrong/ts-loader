import * as path from 'path';
import picomatch from 'picomatch';
import * as webpack from 'webpack';
import type { Diagnostic } from 'typescript/unstable/sync';

import * as constants from './constants';
import type { Colors } from './colors';
import type {
  ErrorInfo,
  FileLocation,
  FilePath,
  LoaderOptions,
  Severity,
  TSInstance,
} from './types';
import {
  addErrorToModule,
  isWebpack5,
  makeError,
  tsLoaderSource,
} from './loaderUtils';

/** Indexed by TypeScript's DiagnosticCategory: Warning, Error, Suggestion, Message */
const diagnosticCategoryNames = [
  'warning',
  'error',
  'suggestion',
  'message',
] as const;

export function reportTypeScriptErrors(
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  errors: readonly webpack.WebpackError[],
) {
  const module = loaderContext._module;

  errors.forEach(error => {
    if (module) {
      addErrorToModule(module, error);
    } else {
      loaderContext.emitError(error);
    }
  });
}

/**
 * Reports diagnostics gathered from non-transpileOnly compiles, deferred
 * until webpack finishes building every module - mirroring classic's
 * afterCompile reporting. A module only gets its own error attached if
 * webpack hasn't already recorded one (avoiding double-counting), but it's
 * always pushed onto `compilation.errors` either way.
 *
 * `instance.pendingDiagnostics` is never cleared: each entry is only
 * overwritten when its file recompiles, so errors keep being re-reported
 * until fixed - matching classic's `filesWithErrors` re-check.
 */
export function reportPendingTypeScriptDiagnostics(
  instance: TSInstance,
  compilation: webpack.Compilation,
) {
  if (instance.pendingDiagnostics.size === 0) {
    return;
  }

  removeCompilationTSLoaderErrors(compilation, instance.loaderOptions);

  const modulesByFile = determineModulesByFile(compilation, instance);

  for (const { fileName, errors } of instance.pendingDiagnostics.values()) {
    if (errors.length === 0) {
      continue;
    }

    const associatedModules = modulesByFile.get(
      instance.resolvedFilePathCache(fileName),
    );

    if (associatedModules === undefined) {
      compilation.errors.push(...errors);
      continue;
    }

    associatedModules.forEach(module => {
      removeModuleTSLoaderError(module, instance.loaderOptions);

      if (!moduleHasWebpackErrors(module)) {
        errors.forEach(error => addErrorToModule(module, error));
      }

      compilation.errors.push(...errors);
    });
  }
}

/**
 * Emits declaration (.d.ts, and .d.ts.map if `declarationMap` is set) files
 * as webpack assets, matching classic's `addDeclarationFilesAsAsset`. Like
 * `pendingDiagnostics`, `pendingDeclarationFiles` is never cleared, so
 * assets aren't lost on a rebuild that doesn't touch that file.
 */
export function emitPendingDeclarationFiles(
  instance: TSInstance,
  compilation: webpack.Compilation,
) {
  for (const declarationFiles of instance.pendingDeclarationFiles.values()) {
    for (const { fileName, text } of declarationFiles) {
      const assetPath = path
        .relative(compilation.compiler.outputPath, fileName)
        .replace(/\\/g, '/');

      if (isWebpack5) {
        compilation.emitAsset(assetPath, new webpack.sources.RawSource(text));
      } else {
        (
          compilation as unknown as {
            assets: Record<
              string,
              { source: () => string; size: () => number }
            >;
          }
        ).assets[assetPath] = {
          source: () => text,
          size: () => Buffer.byteLength(text, 'utf8'),
        };
      }
    }
  }
}

export function filterDiagnosticsForReporting(
  instance: TSInstance,
  context: string,
  diagnostics: readonly Diagnostic[],
): Diagnostic[] {
  const matchesReportFiles = makeReportFilesMatcher(
    instance.loaderOptions.reportFiles,
  );

  return diagnostics.filter(diagnostic => {
    if (
      instance.loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) !== -1
    ) {
      return false;
    }

    if (
      matchesReportFiles !== null &&
      diagnostic.fileName !== undefined &&
      !matchesReportFiles(path.relative(context, diagnostic.fileName))
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Builds a file-matcher from a `reportFiles` pattern array: a file must
 * match a positive pattern AND not match any negative (`!`-prefixed)
 * pattern. Returns `null` when `reportFiles` is empty (no filtering).
 */
function makeReportFilesMatcher(
  reportFiles: readonly string[],
): ((fileName: string) => boolean) | null {
  if (reportFiles.length === 0) {
    return null;
  }

  const positivePatterns: string[] = [];
  const negativePatterns: string[] = [];

  for (const pattern of reportFiles) {
    if (pattern.startsWith('!')) {
      negativePatterns.push(pattern.slice(1));
    } else {
      positivePatterns.push(pattern);
    }
  }

  const matchPositive = picomatch(
    positivePatterns.length > 0 ? positivePatterns : ['**'],
  );
  const matchNegative =
    negativePatterns.length > 0 ? picomatch(negativePatterns) : null;

  return (fileName: string) =>
    matchPositive(fileName) && !(matchNegative && matchNegative(fileName));
}

export function buildTypeScriptError(
  instance: TSInstance,
  diagnostic: Diagnostic,
  context: string,
  module: webpack.Module | undefined,
  fallbackFile = '',
  // Set only when `diagnostic` was fetched using a synthetic, API-facing
  // file identity (see toApiFacingFileName) rather than the file's real
  // path - the path shown to the user should be the real one.
  displayFileName?: string,
) {
  // `fallbackFile` is only passed for config-file-parsing/whole-program
  // diagnostics, which classic ts-loader treats as having no file of their
  // own - even though TypeScript 7 does attach a position (into tsconfig.json)
  // where classic doesn't, so it's deliberately ignored here to match.
  const hasFallbackFile = fallbackFile !== '';
  // `startPosition`/`endPosition` (zero-based) are precomputed by the API on
  // every diagnostic, present exactly when there's a real position.
  const start: FileLocation | undefined =
    !hasFallbackFile && diagnostic.startPosition
      ? {
          line: diagnostic.startPosition.line + 1,
          character: diagnostic.startPosition.character + 1,
        }
      : undefined;
  const end: FileLocation | undefined =
    !hasFallbackFile &&
    diagnostic.endPosition &&
    diagnostic.end > diagnostic.pos
      ? {
          line: diagnostic.endPosition.line + 1,
          character: diagnostic.endPosition.character + 1,
        }
      : undefined;
  const diagnosticFile =
    !hasFallbackFile && diagnostic.fileName
      ? path.normalize(displayFileName ?? diagnostic.fileName)
      : '';
  const errorInfo: ErrorInfo = {
    code: diagnostic.code,
    severity: (diagnosticCategoryNames[diagnostic.category] ??
      'error') as Severity,
    content: diagnostic.text,
    file: diagnosticFile,
    line: start === undefined ? 0 : start.line,
    character: start === undefined ? 0 : start.character,
    context,
  };

  const message =
    instance.loaderOptions.errorFormatter === undefined
      ? defaultErrorFormatter(errorInfo, instance.colors)
      : instance.loaderOptions.errorFormatter(errorInfo, instance.colors);

  const error = makeError(
    instance.loaderOptions,
    message,
    diagnosticFile || fallbackFile,
    start,
    end,
  );

  // Tag the error with its module so webpack's stats can group/locate it
  // even when only pushed onto `compilation.errors` (see
  // reportPendingTypeScriptDiagnostics).
  if (module) {
    error.module = module;
  }

  return error;
}

/**
 * Builds a map of every module in the compilation, keyed by its resource
 * file's path key. A file can be associated with more than one module.
 */
export function determineModulesByFile(
  compilation: webpack.Compilation,
  instance: TSInstance,
): Map<FilePath, webpack.Module[]> {
  const modulesByFile = new Map<FilePath, webpack.Module[]>();

  compilation.modules.forEach(module => {
    const resource = (module as webpack.NormalModule).resource;
    if (!resource) {
      return;
    }

    const resolvedPath = instance.resolvedFilePathCache(resource);
    const existing = modulesByFile.get(resolvedPath);
    if (existing) {
      if (!existing.includes(module)) {
        existing.push(module);
      }
    } else {
      modulesByFile.set(resolvedPath, [module]);
    }
  });

  return modulesByFile;
}

function removeCompilationTSLoaderErrors(
  compilation: webpack.Compilation,
  loaderOptions: LoaderOptions,
) {
  compilation.errors = compilation.errors.filter(
    error =>
      !isTSLoaderModuleError(error as webpack.WebpackError, loaderOptions),
  );
}

function removeModuleTSLoaderError(
  module: webpack.Module,
  loaderOptions: LoaderOptions,
) {
  if (isWebpack5) {
    const warnings = Array.from(module.getWarnings() ?? []);
    const errors = Array.from(module.getErrors() ?? []);
    module.clearWarningsAndErrors();
    warnings.forEach(warning => module.addWarning(warning));
    errors
      .filter(error => !isTSLoaderModuleError(error, loaderOptions))
      .forEach(error => module.addError(error));
  } else {
    const webpackModule = module as unknown as {
      warnings: webpack.WebpackError[];
      errors: webpack.WebpackError[];
    };
    const warnings = (webpackModule.warnings || []).slice();
    const errors = (webpackModule.errors || []).slice();
    webpackModule.warnings = [];
    webpackModule.errors = [];
    warnings.forEach(warning => webpackModule.warnings.push(warning));
    errors
      .filter(error => !isTSLoaderModuleError(error, loaderOptions))
      .forEach(error => webpackModule.errors.push(error));
  }
}

function isTSLoaderModuleError(
  error: webpack.WebpackError,
  loaderOptions: LoaderOptions,
) {
  return error?.details === tsLoaderSource(loaderOptions);
}

function moduleHasWebpackErrors(module: webpack.Module) {
  return module.getNumberOfErrors
    ? module.getNumberOfErrors() > 0
    : ((module as unknown as { errors?: webpack.WebpackError[] }).errors ?? [])
        .length > 0;
}

/** The default error formatter, matching classic ts-loader's output. */
function defaultErrorFormatter(error: ErrorInfo, colors: Colors) {
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

export function dedupeDiagnostics(diagnostics: readonly Diagnostic[]) {
  const seen = new Set<string>();

  return diagnostics.filter(diagnostic => {
    const key = [
      diagnostic.fileName ?? '',
      diagnostic.pos,
      diagnostic.end,
      diagnostic.code,
      diagnostic.category,
      diagnostic.text,
    ].join(':');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
