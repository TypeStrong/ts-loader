import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Chalk } from 'chalk';
import * as webpack from 'webpack';
import type { APIOptions } from 'typescript/unstable/sync';

import * as constants from './constants';
import type {
  ErrorInfo,
  FileLocation,
  FilePathKey,
  LoaderOptions,
  PendingDeclarationFile,
  TypeScriptApi,
  TypeScriptDiagnostic,
  TypeScriptEmitOutput,
  TypeScriptInstance as TypeScriptApiInstance,
  TypeScriptProgram,
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

type TypeScriptApiModule = {
  API: new (options?: APIOptions) => TypeScriptApi;
};

export function createTypeScriptApiInstance(
  loaderOptions: LoaderOptions,
  configFilePath: string
): TypeScriptApiInstance {
  const typeScriptApiModule = loadTypeScriptApiModule(loaderOptions.compiler);

  return {
    api: new typeScriptApiModule.API(),
    configFilePath,
    syntheticConfigFiles: new Map(),
    openedProjectPaths: new Set(),
  };
}

export function getTypeScriptEmit(
  fileName: string,
  contents: string,
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>
) {
  const typeScriptInstance = instance.typeScriptApiInstance;
  const { snapshot, projectConfigPath } = prepareSnapshotForFile(
    typeScriptInstance,
    fileName
  );
  let outputText: string | undefined;
  let sourceMapText: string | undefined;

  typeScriptInstance.api.runWithTemporaryFileUpdate(
    snapshot,
    fileName,
    contents,
    temporarySnapshot => {
      // Prefer the project ts-loader explicitly resolved and opened (via its own
      // configFile resolution) over the API's own nearest-tsconfig auto-discovery,
      // which can pick up an unrelated tsconfig.json that happens to sit closer to
      // `fileName` on disk.
      const configuredProject = temporarySnapshot.getProject(projectConfigPath);
      const project =
        configuredProject?.program.getSourceFile(fileName)
          ? configuredProject
          : temporarySnapshot.getDefaultProjectForFile(fileName) ??
            configuredProject;

      if (!project) {
        throw new Error(
          `TypeScript TypeScript mode could not resolve project for ${fileName}.`
        );
      }

      const program = project.program;
      const emitResult = program.getJavaScriptEmit([fileName]);
      const perFileDiagnostics = dedupeDiagnostics([
        ...program.getSyntacticDiagnostics(fileName),
        // Type-checking is skipped entirely in transpileOnly mode, matching
        // classic ts-loader's transpileModule-based behaviour.
        ...(instance.loaderOptions.transpileOnly
          ? []
          : [...emitResult.diagnostics, ...program.getSemanticDiagnostics(fileName)]),
      ]);

      // Classic ts-loader's transpileOnly path (built on `ts.transpileModule`)
      // surfaces whole-program/compiler-option diagnostics too - e.g. "rootDir
      // must be explicitly set" - that its full-compile path doesn't (those
      // are presumably superseded there by more specific per-file
      // diagnostics). There's no transpileModule equivalent here, so these
      // are pulled from the program directly, matching that same
      // transpileOnly-only placement.
      const programDiagnostics = instance.loaderOptions.transpileOnly
        ? dedupeDiagnostics(program.getProgramDiagnostics())
        : [];

      ({ outputText, sourceMapText } =
        getOutputAndSourceMapFromTypeScriptEmit(emitResult));

      registerTypeScriptDependencies(loaderContext, program, fileName, instance);

      // Errors must be built here, synchronously, while `program` is still
      // backed by this call's temporary snapshot - it's invalidated as soon as
      // this callback returns, so it can't be held onto for later use.
      const errors = [
        ...filterIgnoredDiagnostics(instance, perFileDiagnostics).map(
          diagnostic =>
            buildTypeScriptError(
              instance,
              diagnostic,
              program,
              loaderContext.context,
              loaderContext._module
            )
        ),
        // Program diagnostics have no associated file of their own (classic
        // attributes them to the tsconfig instead).
        ...filterIgnoredDiagnostics(instance, programDiagnostics).map(
          diagnostic =>
            buildTypeScriptError(
              instance,
              diagnostic,
              program,
              loaderContext.context,
              loaderContext._module,
              typeScriptInstance.configFilePath
            )
        ),
      ];

      if (instance.loaderOptions.transpileOnly) {
        // Type-checking is skipped in transpileOnly mode, so there's no need to
        // wait for the rest of the compilation: report immediately, matching
        // classic ts-loader's transpileModule-based behaviour.
        reportTypeScriptErrors(loaderContext, errors);
      } else {
        // Defer attaching these errors to a module until the compilation's
        // processAssets hook (see reportPendingTypeScriptDiagnostics in index.ts),
        // matching classic ts-loader: reporting only once webpack has finished
        // parsing every module's output means we can tell whether webpack
        // already recorded its own error for this module (e.g. a "Module parse
        // failed" caused by malformed emit) and avoid attaching a redundant,
        // double-counted error.
        instance.pendingDiagnostics.set(instance.filePathKeyMapper(fileName), {
          fileName,
          errors,
        });
      }

      // Declaration files, like errors, are only produced from a full
      // (non-transpileOnly) compile, and their content must be read out here,
      // synchronously, for the same reason as `errors` above. Emitting them as
      // webpack assets is deferred to emitPendingDeclarationFiles.
      if (
        !instance.loaderOptions.transpileOnly &&
        program.getCompilerOptions().declaration
      ) {
        // The whole project is scanned here - not just `fileName` - because
        // some project files (e.g. a plain .js file pulled in via `allowJs`)
        // are never themselves passed through ts-loader's own webpack rule,
        // so this is the only opportunity to emit their declarations too.
        // Matches classic ts-loader's `provideDeclarationFilesToWebpack`,
        // which likewise emits declarations for every project file matching
        // this same regex, not just files webpack's rule happens to compile.
        recordProjectDeclarationFiles(instance, program);
      }
    }
  );

  return { outputText, sourceMapText };
}

function loadTypeScriptApiModule(compilerPackage: string): TypeScriptApiModule {
  const specifier = `${compilerPackage}/unstable/sync`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- ESM-only entrypoint, loadable via Node's require(esm) support (Node >= 22.12)
    return require(specifier) as TypeScriptApiModule;
  } catch (error) {
    throw new Error(
      `Could not load TypeScript typeScript API from "${specifier}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function updateSnapshot(
  typeScriptInstance: TypeScriptApiInstance,
  fileName: string,
  openProjects?: string[]
) {
  const previousSnapshot = typeScriptInstance.snapshot;
  // `openFiles` only tells the API which file has a live, in-memory override
  // for *this* call (via the temporary-file-update below) - it's not a signal
  // that any file changed on disk. ts-loader only ever learns about the one
  // file webpack is currently asking it to compile, not which *other* project
  // files (e.g. a dependency) may have changed on disk since the last
  // snapshot - so there's no specific file list to report here. Without
  // `invalidateAll`, those other files would stay cached with whatever
  // content the API last saw, even after they've genuinely changed on disk -
  // exactly what happens on every watch-mode rebuild.
  const fileChanges = { invalidateAll: true } as const;
  const snapshot = typeScriptInstance.api.updateSnapshot(
    openProjects && openProjects.length > 0
      ? { openProjects, openFiles: [fileName], fileChanges }
      : { openFiles: [fileName], fileChanges }
  );

  typeScriptInstance.snapshot = snapshot;
  openProjects?.forEach(projectPath =>
    typeScriptInstance.openedProjectPaths.add(projectPath)
  );
  previousSnapshot?.dispose?.();

  return snapshot;
}

function prepareSnapshotForFile(typeScriptInstance: TypeScriptApiInstance, fileName: string) {
  const primaryProjectPath = typeScriptInstance.configFilePath;
  const snapshot = updateSnapshot(
    typeScriptInstance,
    fileName,
    typeScriptInstance.openedProjectPaths.has(primaryProjectPath)
      ? undefined
      : [primaryProjectPath]
  );
  const primaryProject = snapshot.getProject(primaryProjectPath);

  if (primaryProject?.program.getSourceFile(fileName)) {
    return { snapshot, projectConfigPath: primaryProjectPath };
  }

  const syntheticConfigPath = ensureSyntheticConfigForFile(
    typeScriptInstance,
    primaryProjectPath,
    primaryProject?.parsedCommandLine.fileNames ?? [],
    fileName
  );
  const syntheticSnapshot = updateSnapshot(
    typeScriptInstance,
    fileName,
    typeScriptInstance.openedProjectPaths.has(syntheticConfigPath)
      ? undefined
      : [syntheticConfigPath]
  );

  return { snapshot: syntheticSnapshot, projectConfigPath: syntheticConfigPath };
}

function ensureSyntheticConfigForFile(
  typeScriptInstance: TypeScriptApiInstance,
  configFilePath: string,
  rootFiles: readonly string[],
  fileName: string
) {
  const existing = typeScriptInstance.syntheticConfigFiles.get(fileName);
  if (existing) {
    return existing;
  }

  const syntheticConfigDir = path.join(os.tmpdir(), 'ts-loader-ts7-configs');
  fs.mkdirSync(syntheticConfigDir, { recursive: true });
  const syntheticConfigPath = path.join(
    syntheticConfigDir,
    `${path.basename(configFilePath, '.json')}.ts-loader.${hashFileName(fileName)}.json`
  );
  const files = [...new Set([...rootFiles, fileName])].sort();
  const configText = JSON.stringify(
    {
      extends: configFilePath,
      files,
    },
    null,
    2
  );
  fs.writeFileSync(syntheticConfigPath, configText);
  typeScriptInstance.syntheticConfigFiles.set(fileName, syntheticConfigPath);
  return syntheticConfigPath;
}

function hashFileName(fileName: string) {
  return crypto.createHash('sha1').update(fileName).digest('hex').slice(0, 12);
}

function getOutputAndSourceMapFromTypeScriptEmit(emitResult: TypeScriptEmitOutput) {
  let outputText: string | undefined;
  let sourceMapText: string | undefined;

  for (const [fileName, outputFile] of emitResult.outputFiles) {
    if (constants.jsJsxMap.test(fileName)) {
      sourceMapText = outputFile.text;
    } else if (constants.jsJsx.test(fileName)) {
      outputText = outputFile.text;
    }
  }

  return { outputText, sourceMapText };
}

function registerTypeScriptDependencies(
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  program: TypeScriptProgram,
  fileName: string,
  instance: TSInstance
) {
  loaderContext.clearDependencies();
  loaderContext.addDependency(fileName);

  // Every *other* file this one is made dependent on below, tracked
  // separately from `fileName` itself so their versions can be baked into
  // this module's buildMeta afterwards (see the comment further down).
  const dependencies: string[] = [];
  const addDependency = (dependencyFileName: string) => {
    loaderContext.addDependency(dependencyFileName);
    dependencies.push(dependencyFileName);
  };

  // Make this file dependent on *all* definition files in the program, since
  // they aren't necessarily reflected in webpack's own module graph (they're
  // rarely `require`d at runtime) but can still affect this file's type-check.
  // Regular .ts/.tsx/.js source files are handled separately below, scoped to
  // this file's own resolved imports: adding every source file in the program
  // here would make every file's build cache dependent on every other file,
  // even ones it doesn't really depend on (e.g. a module TypeScript failed to
  // resolve, and thus never emitted a `require` for - see
  // registerResolvedImportDependencies).
  for (const otherFileName of program.getSourceFileNames()) {
    if (
      otherFileName === fileName ||
      !constants.dtsDtsxOrDtsDtsxMapRegex.test(otherFileName)
    ) {
      continue;
    }

    const sourceFile = program.getSourceFile(otherFileName);

    if (
      sourceFile &&
      !program.isSourceFileDefaultLibrary(sourceFile) &&
      !program.isSourceFileFromExternalLibrary(sourceFile)
    ) {
      addDependency(otherFileName);
    }
  }

  // Cross-file dependency tracking is only meaningful for a full,
  // type-checked compile: transpileOnly mode never looks at another file's
  // types (matching classic ts-loader's isolated `transpileModule`
  // behaviour), so a dependency's content genuinely can't affect this file's
  // transpiled output, and shouldn't force a rebuild of it.
  if (!instance.loaderOptions.transpileOnly) {
    registerResolvedImportDependencies(program, fileName, addDependency);
  }

  for (const fileName of program.getConfigFileNames()) {
    if (isWebpack5) {
      loaderContext.addBuildDependency(fileName);
    } else {
      loaderContext.addDependency(fileName);
    }
  }

  // A dependency's content can change this file's *diagnostics* even when its
  // own emitted JavaScript doesn't (e.g. `dep1.ts`'s exported function
  // signature changing which of `fileName`'s calls now type-check). Without
  // this, webpack may see this module's own source and dependency list as
  // unchanged from a previous build and reuse a cached code-generation
  // result, silently dropping/keeping stale diagnostics. Matches classic
  // ts-loader's `buildMeta.tsLoaderDefinitionFileVersions`.
  if (loaderContext._module?.buildMeta !== undefined) {
    loaderContext._module.buildMeta.tsLoaderDefinitionFileVersions =
      dependencies.map(
        dependencyFileName =>
          `${dependencyFileName}@${
            instance.files.get(instance.filePathKeyMapper(dependencyFileName))
              ?.version ?? '?'
          }`
      );
  }
}

/**
 * Makes `fileName` dependent on whichever *other project source files* it
 * actually imports via a relative specifier (e.g. `./dep1`), so that webpack
 * knows to rebuild it when one of those genuinely-resolved dependencies
 * changes - matching classic ts-loader's dependency-graph-based tracking
 * (`instance.dependencyGraph`, populated from TypeScript's own module
 * resolution). Without this, a file whose type-check depends on another
 * file's exports (not just its own .d.ts declarations) would incorrectly stay
 * cached across rebuilds of that dependency.
 *
 * Bare/absolute specifiers (an npm package, or anything TypeScript couldn't
 * resolve at all, e.g. via a webpack-only alias) are deliberately left alone:
 * webpack's own module graph already tracks genuinely bundled ones, and it
 * would be wrong to force a rebuild whenever some unrelated file matching an
 * *unresolved* specifier happens to change (see the aliasResolution test).
 */
function registerResolvedImportDependencies(
  program: TypeScriptProgram,
  fileName: string,
  addDependency: (dependencyFileName: string) => void
) {
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    return;
  }

  const sourceFileNames = new Set(program.getSourceFileNames());
  const fromDir = path.dirname(fileName);

  for (const specifierNode of sourceFile.imports) {
    // `imports` is a module specifier expression - a string literal in
    // practice for both `import ... from '...'` and `require('...')` - but
    // the API types it as a generic `Node`, which has no `.text`.
    const specifier = (specifierNode as unknown as { text: string }).text;
    if (typeof specifier !== 'string' || !specifier.startsWith('.')) {
      continue;
    }

    const resolvedFileName = resolveRelativeSpecifier(
      fromDir,
      specifier,
      sourceFileNames
    );

    if (resolvedFileName && resolvedFileName !== fileName) {
      addDependency(resolvedFileName);
    }
  }
}

const relativeSpecifierExtensions = ['', '.ts', '.tsx', '.d.ts', '.js', '.jsx'];

function resolveRelativeSpecifier(
  fromDir: string,
  specifier: string,
  sourceFileNames: ReadonlySet<string>
): string | undefined {
  const resolvedBase = path.resolve(fromDir, specifier);

  for (const extension of relativeSpecifierExtensions) {
    const candidate = resolvedBase + extension;
    if (sourceFileNames.has(candidate)) {
      return candidate;
    }
  }

  for (const extension of relativeSpecifierExtensions) {
    const candidate = path.join(resolvedBase, `index${extension}`);
    if (sourceFileNames.has(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Emits declarations for every source file in the project matching the given
 * compiler options' allowJs setting - not just the file currently being
 * compiled - matching classic ts-loader's `provideDeclarationFilesToWebpack`.
 */
function recordProjectDeclarationFiles(
  instance: TSInstance,
  program: TypeScriptProgram
) {
  const filePathRegex = program.getCompilerOptions().allowJs
    ? constants.dtsTsTsxJsJsxRegex
    : constants.dtsTsTsxRegex;

  for (const projectFileName of program.getSourceFileNames()) {
    if (!filePathRegex.test(projectFileName)) {
      continue;
    }

    const sourceFile = program.getSourceFile(projectFileName);

    if (
      !sourceFile ||
      program.isSourceFileDefaultLibrary(sourceFile) ||
      program.isSourceFileFromExternalLibrary(sourceFile)
    ) {
      continue;
    }

    const declarationEmit = program.getDeclarationEmit([projectFileName]);
    const declarationFiles: PendingDeclarationFile[] = [];

    for (const [
      declarationFileName,
      declarationOutputFile,
    ] of declarationEmit.outputFiles) {
      declarationFiles.push({
        fileName: declarationFileName,
        text: declarationOutputFile.text,
      });
    }

    instance.pendingDeclarationFiles.set(
      instance.filePathKeyMapper(projectFileName),
      declarationFiles
    );
  }
}

function reportTypeScriptErrors(
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  errors: readonly webpack.WebpackError[]
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
 * Reports diagnostics gathered from non-transpileOnly compiles, deferred until
 * webpack has finished building every module in this compilation. Mirrors
 * classic ts-loader's afterCompile-based reporting: a module only gets its own
 * ts-loader error attached if webpack hasn't already recorded an error for it
 * (e.g. a "Module parse failed" caused by malformed emit), so a single
 * underlying failure isn't double-counted in the per-module error tally. The
 * diagnostic is always pushed onto the compilation as a whole either way, so
 * it's still surfaced and counted in the overall error total.
 *
 * `instance.pendingDiagnostics` is intentionally *not* cleared after
 * reporting: each entry is only overwritten when its file is recompiled (see
 * getTypeScriptEmit), so a file's errors keep being re-reported on every
 * subsequent compilation even if webpack's cache means that file itself
 * doesn't get rebuilt - matching classic ts-loader's `filesWithErrors`
 * re-check behaviour. Fixing the file (or removing the error) naturally
 * clears it, since recompiling always overwrites the entry with fresh
 * (possibly empty) errors.
 */
export function reportPendingTypeScriptDiagnostics(
  instance: TSInstance,
  compilation: webpack.Compilation
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
      instance.filePathKeyMapper(fileName)
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
 * gathered from full (non-transpileOnly) compiles as webpack assets, matching
 * classic ts-loader's `provideDeclarationFilesToWebpack`/
 * `addDeclarationFilesAsAsset`. Like `reportPendingTypeScriptDiagnostics`,
 * `instance.pendingDeclarationFiles` is never cleared - each entry persists
 * and keeps being re-emitted every compilation until its source file is
 * recompiled, so the assets aren't lost on a rebuild that doesn't touch that
 * particular file.
 */
export function emitPendingDeclarationFiles(
  instance: TSInstance,
  compilation: webpack.Compilation
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

function filterIgnoredDiagnostics(
  instance: TSInstance,
  diagnostics: readonly TypeScriptDiagnostic[]
) {
  return diagnostics.filter(
    diagnostic =>
      instance.loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) === -1
  );
}

function buildTypeScriptError(
  instance: TSInstance,
  diagnostic: TypeScriptDiagnostic,
  program: TypeScriptProgram,
  context: string,
  module: webpack.Module | undefined,
  fallbackFile = ''
) {
  const { start, end } = getDiagnosticLocations(diagnostic, program);
  // A diagnostic with no file of its own (e.g. a whole-program/compiler-option
  // diagnostic) has no meaningful "in <file>(line,char)" location to report,
  // so the formatted message leaves `file` empty; `fallbackFile` only affects
  // the *webpack error's own* `.file`/module attribution below, matching
  // classic ts-loader's split between `ErrorInfo.file` (from the diagnostic)
  // and the `merge.file` passed to `makeError` (from the caller).
  const diagnosticFile = diagnostic.fileName
    ? path.normalize(diagnostic.fileName)
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
    end
  );

  // Matches classic ts-loader: tag the error with its module explicitly so
  // webpack's stats can still group/locate it correctly even when it's only
  // pushed onto `compilation.errors` without being attached via
  // `module.addError` (see reportPendingTypeScriptDiagnostics).
  if (module) {
    error.module = module;
  }

  return error;
}

/**
 * Builds a map of every module in the compilation, keyed by its resource
 * file's path key. A file can be associated with more than one module.
 */
function determineModulesByFile(
  compilation: webpack.Compilation,
  instance: TSInstance
): Map<FilePathKey, webpack.Module[]> {
  const modulesByFile = new Map<FilePathKey, webpack.Module[]>();

  compilation.modules.forEach(module => {
    const resource = (module as webpack.NormalModule).resource;
    if (!resource) {
      return;
    }

    const key = instance.filePathKeyMapper(resource);
    const existing = modulesByFile.get(key);
    if (existing) {
      if (!existing.includes(module)) {
        existing.push(module);
      }
    } else {
      modulesByFile.set(key, [module]);
    }
  });

  return modulesByFile;
}

function removeCompilationTSLoaderErrors(
  compilation: webpack.Compilation,
  loaderOptions: LoaderOptions
) {
  compilation.errors = compilation.errors.filter(
    error => !isTSLoaderModuleError(error as webpack.WebpackError, loaderOptions)
  );
}

function removeModuleTSLoaderError(
  module: webpack.Module,
  loaderOptions: LoaderOptions
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
  loaderOptions: LoaderOptions
) {
  return error?.details === tsLoaderSource(loaderOptions);
}

function moduleHasWebpackErrors(module: webpack.Module) {
  return module.getNumberOfErrors
    ? module.getNumberOfErrors() > 0
    : ((module as unknown as { errors?: webpack.WebpackError[] }).errors ?? [])
        .length > 0;
}

function getDiagnosticLocations(
  diagnostic: TypeScriptDiagnostic,
  program: TypeScriptProgram
): { start: FileLocation | undefined; end: FileLocation | undefined } {
  if (!diagnostic.fileName || diagnostic.pos < 0) {
    return { start: undefined, end: undefined };
  }

  const sourceFile = program.getSourceFile(diagnostic.fileName);
  if (!sourceFile) {
    return { start: undefined, end: undefined };
  }

  const startLC = sourceFile.getLineAndCharacterOfPosition(diagnostic.pos);
  const start: FileLocation = {
    line: startLC.line + 1,
    character: startLC.character + 1,
  };

  const end: FileLocation | undefined =
    diagnostic.end > diagnostic.pos
      ? (() => {
          const endLC = sourceFile.getLineAndCharacterOfPosition(
            diagnostic.end
          );
          return { line: endLC.line + 1, character: endLC.character + 1 };
        })()
      : undefined;

  return { start, end };
}

/** The default error formatter, matching classic ts-loader's output. */
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

function dedupeDiagnostics(diagnostics: readonly TypeScriptDiagnostic[]) {
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
