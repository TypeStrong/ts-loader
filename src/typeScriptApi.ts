import * as crypto from 'crypto';
import * as path from 'path';
import picomatch from 'picomatch';
import * as webpack from 'webpack';
import type { APIOptions, CompilerOptions } from 'typescript/unstable/sync';

import * as constants from './constants';
import type { Colors } from './colors';
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
  configFilePath: string,
  files: TSInstance['files'],
  filePathKeyMapper: TSInstance['filePathKeyMapper'],
): TypeScriptApiInstance {
  const typeScriptApiModule = loadTypeScriptApiModule(loaderOptions.compiler);

  // Synthetic tsconfig files (see ensureSyntheticConfigForFile) are never
  // written to real disk - they're served entirely from this in-memory map
  // via the `readFile` override below, keyed by the exact synthetic path
  // `ensureSyntheticConfigForFile` generates. That path is always a sibling
  // of the real config it `extends`, so its directory already exists on
  // disk and no `fileExists`/`directoryExists` override is needed for the
  // API to treat it as real.
  const syntheticConfigContents = new Map<string, string>();

  return {
    // Other loaders (e.g. a raw-loader-style pre-processor chained before
    // ts-loader) transform a file's contents before ts-loader ever sees them,
    // and `instance.files` is ts-loader's own record of that post-transform
    // text for every file it has directly compiled. Without this override the
    // API would read a project file's content straight off disk whenever it
    // isn't the one file currently being compiled via
    // `runWithTemporaryFileUpdate` (e.g. rechecking a dependant after one of
    // its dependencies changes) - missing whatever transformation other
    // loaders applied, and seeing stale/raw content other loaders were meant
    // to strip out. Falling through to the real filesystem (`undefined`) for
    // anything ts-loader hasn't itself compiled (ambient .d.ts files, etc.)
    // matches classic ts-loader's own LanguageServiceHost, which is likewise
    // backed entirely by its `instance.files`/`instance.otherFiles` maps.
    api: new typeScriptApiModule.API({
      fs: {
        // A purely synthetic identity - e.g. `component.vue.ts` for a
        // `component.vue` file compiled via `appendTsSuffixTo` - never
        // exists under that exact name on real disk, only `readFile` ever
        // serves it. Without this override, validating a `files` array
        // entry (or resolving an import) that names such a file falls back
        // to a real disk check, which correctly finds nothing and reports
        // "File not found" (TS6053) - regardless of `readFile` being able
        // to serve its content just fine. `true`/`undefined` (not `false`)
        // so anything we don't know about still falls through to the real
        // filesystem, matching `readFile`'s own fallback philosophy.
        fileExists: fileName =>
          syntheticConfigContents.has(toComparablePath(fileName)) ||
          files.has(filePathKeyMapper(fileName))
            ? true
            : undefined,
        // `fileName` here is whatever identifier the API's own internals use
        // when it asks to read a file - which, per the same
        // forward-slash-normalization convention as `getSourceFileNames()`
        // elsewhere (see toComparablePath's other call sites), is not
        // necessarily the exact OS-native string `ensureSyntheticConfigForFile`
        // stored this content under on Windows. Comparing via the normalized
        // form keeps the lookup working regardless of which spelling the API
        // hands back - `files.get(filePathKeyMapper(...))` doesn't need the
        // same treatment since `filePathKeyMapper` already normalizes via
        // `path.resolve`, which tolerates either separator style.
        readFile: fileName =>
          syntheticConfigContents.get(toComparablePath(fileName)) ??
          files.get(filePathKeyMapper(fileName))?.text,
      },
    }),
    configFilePath,
    syntheticConfigContents,
    syntheticConfigFiles: new Map(),
    openedProjectPaths: new Set(),
  };
}

// const DIAGNOSTIC_CODE_FILE_NOT_FOUND = 6053;

export function getTypeScriptEmit(
  fileName: string,
  contents: string,
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
) {
  // See toApiFacingFileName: every call into the TypeScript API below uses
  // this instead of `fileName` itself, which is reserved for everything
  // reported back to webpack (dependencies, error locations) or shown to
  // the user.
  const apiFileName = toApiFacingFileName(fileName);

  // `api.transpileModule`/`transpileDeclaration` are program-less,
  // single-file transforms - matching classic ts-loader's own
  // `ts.transpileModule`-based transpileOnly behaviour, `fileName` never
  // needs to be part of any project's program to use them, so none of the
  // synthetic-root machinery below (needed only to satisfy
  // `program.getJavaScriptEmit`'s root-file requirement, and the
  // node_modules-specific emit restriction it exists to work around)
  // applies to transpileOnly at all.
  if (instance.loaderOptions.transpileOnly) {
    return getTranspileOnlyEmit(
      fileName,
      apiFileName,
      contents,
      instance,
      loaderContext,
    );
  }

  const typeScriptInstance = instance.typeScriptApiInstance;
  // A node_modules file can be *discovered* as part of the primary
  // project's program via ordinary import resolution (any real,
  // resolvable .ts file, node_modules or not) without ever being one of
  // its root files - and this API skips emitting output for a source file
  // in that position, matching classic ts-loader's own default refusal to
  // compile .ts files under node_modules (there, by simply never adding
  // them to its root file set), unless the user has explicitly opted in via
  // `allowTsInNodeModules` - forcing the synthetic single-file project
  // fallback below (which *does* list the file as an explicit root)
  // replicates classic's "just compile it" opt-in behaviour here too.
  const forceSyntheticRoot =
    instance.loaderOptions.allowTsInNodeModules &&
    fileName.indexOf('node_modules') !== -1;
  const { snapshot, projectConfigPath } = prepareSnapshotForFile(
    typeScriptInstance,
    apiFileName,
    forceSyntheticRoot,
  );
  let outputText: string | undefined;
  let sourceMapText: string | undefined;
  // Classic ts-loader surfaces this specific failure by returning `{error}`
  // up to its top-level `loader` function, which reconstructs a fresh
  // `Error` right there (discarding whatever deeper stack the original
  // carried) - giving it a stack trace that's just a single
  // `at Object.loader (...)` frame. This mirrors that: the message is
  // captured here rather than thrown, so `index.ts` can do the same
  // reconstruction in `loader`'s own frame.
  let configParseErrorMessage: string | undefined;

  typeScriptInstance.api.runWithTemporaryFileUpdate(
    snapshot,
    apiFileName,
    contents,
    temporarySnapshot => {
      // Prefer the project ts-loader explicitly resolved and opened (via its own
      // configFile resolution) over the API's own nearest-tsconfig auto-discovery,
      // which can pick up an unrelated tsconfig.json that happens to sit closer to
      // `fileName` on disk.
      const configuredProject = temporarySnapshot.getProject(projectConfigPath);
      // A configured project that failed to parse at all (e.g. an `include`
      // pattern matching no files) is a hard failure to surface as-is, not a
      // reason to fall back to a different project that happens to resolve
      // `fileName` successfully (silently papering over the broken config).
      const configuredProjectFailedToParse =
        configuredProject !== undefined &&
        configuredProject.program.getConfigFileParsingDiagnostics().length > 0;
      const project = configuredProjectFailedToParse
        ? configuredProject
        : configuredProject?.program.getSourceFile(apiFileName)
          ? configuredProject
          : (temporarySnapshot.getDefaultProjectForFile(apiFileName) ??
            configuredProject);

      if (!project) {
        throw new Error(
          `TypeScript TypeScript mode could not resolve project for ${fileName}.`,
        );
      }

      const program = project.program;

      const configFileParsingDiagnostics =
        program.getConfigFileParsingDiagnostics();
      if (configFileParsingDiagnostics.length > 0) {
        // A broken tsconfig (e.g. an `include` pattern matching no files) is
        // a hard failure in classic ts-loader too, not just a diagnostic:
        // there's nothing meaningful left to compile, so it reports the
        // diagnostic(s) then throws, which webpack surfaces as a "Module
        // build failed" error on top.
        const configErrors = filterDiagnosticsForReporting(
          instance,
          loaderContext.context,
          dedupeDiagnostics(configFileParsingDiagnostics),
        ).map(diagnostic =>
          buildTypeScriptError(
            instance,
            diagnostic,
            program,
            loaderContext.context,
            loaderContext._module,
            typeScriptInstance.configFilePath,
          ),
        );

        reportTypeScriptErrors(loaderContext, configErrors);

        configParseErrorMessage = instance.colors.red(
          'error while parsing tsconfig.json',
        );
        return;
      }

      const emitResult = program.getJavaScriptEmit([apiFileName]);
      const perFileDiagnostics = dedupeDiagnostics([
        ...program.getSyntacticDiagnostics(apiFileName),
        ...emitResult.diagnostics,
        ...program.getSemanticDiagnostics(apiFileName),
      ]);

      ({ outputText, sourceMapText } =
        getOutputAndSourceMapFromTypeScriptEmit(emitResult));

      registerTypeScriptDependencies(
        loaderContext,
        program,
        fileName,
        apiFileName,
        instance,
      );

      // Errors must be built here, synchronously, while `program` is still
      // backed by this call's temporary snapshot - it's invalidated as soon as
      // this callback returns, so it can't be held onto for later use.
      const errors = filterDiagnosticsForReporting(
        instance,
        loaderContext.context,
        perFileDiagnostics,
      ).map(diagnostic =>
        buildTypeScriptError(
          instance,
          diagnostic,
          program,
          loaderContext.context,
          loaderContext._module,
          '',
          // perFileDiagnostics is always about apiFileName - once
          // getDiagnosticLocations (inside buildTypeScriptError) has used
          // that identity to resolve a line/character via `program`, the
          // real fileName is what should actually reach the user.
          fileName,
        ),
      );

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

      // A dependant's *diagnostics* can change here even though its own
      // module isn't rebuilt (e.g. `deeperDep.ts` changing a parameter type
      // makes one of `app.ts`'s calls to it, transitively via `dep.ts`, now
      // invalid) - webpack has no reason to re-invoke ts-loader for
      // `app.ts` itself, since neither its own source nor its *direct*
      // dependencies changed. Matches classic ts-loader's afterCompile
      // re-check, which is likewise decoupled from webpack's own
      // module-rebuild decisions (driven by its persistent
      // language service/program rather than a fresh loader invocation).
      //
      // Only meaningful against the primary project's own Program: a
      // synthetic one-off project (see ensureSyntheticConfigForFile) is a
      // narrow, throwaway compilation context for this one file, not a
      // stand-in for the real project graph - recomputing some *other*
      // file's diagnostics against it would use the wrong compiler options
      // and the wrong resolved-import graph (e.g. another file's relative
      // import of this one, resolved against the synthetic project's own
      // slim file set, can coincidentally collide with this file's own
      // apiFileName and be misidentified as a dependant).
      if (projectConfigPath === typeScriptInstance.configFilePath) {
        recheckTransitiveDependants(
          instance,
          program,
          apiFileName,
          loaderContext,
        );
      }

      // Declaration files, like errors, must be read out here, synchronously,
      // for the same reason as `errors` above. Emitting them as webpack
      // assets is deferred to emitPendingDeclarationFiles.
      if (
        program.getCompilerOptions().declaration ||
        program.getCompilerOptions().composite
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
    },
  );

  return { outputText, sourceMapText, configParseErrorMessage };
}

/**
 * transpileOnly's own emit path, built directly on `api.transpileModule`
 * (and, for `isolatedDeclarations` projects, `api.transpileDeclaration`)
 * instead of `getTypeScriptEmit`'s program-based
 * `program.getJavaScriptEmit`. Both are program-less, single-file
 * transforms - matching classic ts-loader's own `ts.transpileModule`-based
 * transpileOnly behaviour - so `fileName` never needs to be resolved as
 * part of any project's program: only the project's resolved compiler
 * options (respecting `extends`, etc.) are needed, not its root files.
 */
function getTranspileOnlyEmit(
  fileName: string,
  apiFileName: string,
  contents: string,
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
) {
  const typeScriptInstance = instance.typeScriptApiInstance;
  const { primaryProjectPath, primaryProject: project } = openPrimaryProject(
    typeScriptInstance,
    apiFileName,
  );

  if (!project) {
    throw new Error(
      `TypeScript TypeScript mode could not resolve project for ${fileName}.`,
    );
  }

  const program = project.program;
  const configFileParsingDiagnostics =
    program.getConfigFileParsingDiagnostics();

  if (configFileParsingDiagnostics.length > 0) {
    // See the equivalent check in getTypeScriptEmit: a broken tsconfig is a
    // hard failure to surface as-is.
    const configErrors = filterDiagnosticsForReporting(
      instance,
      loaderContext.context,
      dedupeDiagnostics(configFileParsingDiagnostics),
    ).map(diagnostic =>
      buildTypeScriptError(
        instance,
        diagnostic,
        program,
        loaderContext.context,
        loaderContext._module,
        primaryProjectPath,
      ),
    );

    reportTypeScriptErrors(loaderContext, configErrors);

    return {
      outputText: undefined,
      sourceMapText: undefined,
      configParseErrorMessage: instance.colors.red(
        'error while parsing tsconfig.json',
      ),
    };
  }

  // Unlike every other call into the API in this file, `transpileModule`/
  // `transpileDeclaration` build their own throwaway virtual filesystem from
  // `fileName` verbatim rather than resolving it through a `Project` (which
  // normalizes internally) - handed an OS-native, backslash-separated path,
  // that panics on Windows ("mixed posix and windows paths") once it's
  // combined with the API's own forward-slash-normalized internal paths. See
  // toComparablePath. (A bare basename was tried instead of normalizing -
  // simpler, and sidesteps the panic entirely - but broke `rootDir`
  // containment diagnostics like TS6059, which need `fileName`'s real
  // directory to check against `rootDir`. Its absolute path is still
  // required.)
  const transpileFileName = toComparablePath(apiFileName);

  const compilerOptions = program.getCompilerOptions();
  const { outputText, sourceMapText, diagnostics = [] } =
    typeScriptInstance.api.transpileModule(contents, {
      // `isolatedDeclarations` is irrelevant to JS emit - `transpileModule`
      // never produces declarations - but the API currently raises a
      // spurious "cannot be specified without declaration or composite"
      // (TS5069) whenever it's present at all, even alongside `declaration:
      // true`. Omitted here rather than fixed upstream; it's still passed
      // to `transpileDeclaration` below, where it's meaningful.
      compilerOptions: omitIsolatedDeclarations(compilerOptions),
      fileName: transpileFileName,
      reportDiagnostics: true,
    });

  // Classic ts-loader's transpileOnly path (built on `ts.transpileModule`)
  // surfaces whole-program/compiler-option diagnostics too - e.g. "rootDir
  // must be explicitly set" - that its full-compile path doesn't (those are
  // presumably superseded there by more specific per-file diagnostics).
  // `transpileModule` has no project of its own to derive these from, so
  // they're pulled from the resolved project directly, matching that same
  // transpileOnly-only placement.
  const programDiagnostics = dedupeDiagnostics(
    program.getProgramDiagnostics(),
  );

  // `transpileModule` is program-less, so its diagnostics have no `Program`
  // to resolve a line/character from (see getDiagnosticLocations) - since it
  // only ever transpiles the one file it was handed, this resolves that
  // lookup directly against `contents` instead. Diagnostics echo back
  // whatever spelling of `fileName` was passed in above, so the lookup key
  // has to match that exactly (`transpileFileName`, not `apiFileName`).
  const singleFileLocationSource = makeSingleFileLocationSource(
    transpileFileName,
    contents,
  );

  const errors = [
    ...filterDiagnosticsForReporting(
      instance,
      loaderContext.context,
      dedupeDiagnostics(diagnostics),
    ).map(diagnostic =>
      buildTypeScriptError(
        instance,
        diagnostic,
        singleFileLocationSource,
        loaderContext.context,
        loaderContext._module,
        '',
        fileName,
      ),
    ),
    // Program diagnostics have no associated file of their own (classic
    // attributes them to the tsconfig instead).
    ...filterDiagnosticsForReporting(
      instance,
      loaderContext.context,
      programDiagnostics,
    ).map(diagnostic =>
      buildTypeScriptError(
        instance,
        diagnostic,
        program,
        loaderContext.context,
        loaderContext._module,
        primaryProjectPath,
      ),
    ),
  ];

  // Type-checking is skipped in transpileOnly mode, so there's no need to
  // wait for the rest of the compilation: report immediately, matching
  // classic ts-loader's transpileModule-based behaviour.
  reportTypeScriptErrors(loaderContext, errors);

  registerTypeScriptDependencies(
    loaderContext,
    program,
    fileName,
    apiFileName,
    instance,
  );

  // `isolatedDeclarations` is what makes single-file declaration emission
  // sound without a checker (every exported type is explicitly annotated by
  // construction) - `transpileDeclaration` mirrors classic TypeScript's own
  // isolatedDeclarations fast path, and is the only way transpileOnly mode
  // can produce .d.ts output at all: the full, type-checked
  // `program.getDeclarationEmit` path (recordProjectDeclarationFiles) needs
  // a checker, which transpileOnly deliberately never runs.
  if (
    (compilerOptions.declaration || compilerOptions.composite) &&
    compilerOptions.isolatedDeclarations
  ) {
    recordTranspileOnlyDeclarationFile(
      instance,
      typeScriptInstance,
      loaderContext,
      fileName,
      // A bare basename, not transpileFileName's full absolute path - see
      // this parameter's own comment on recordTranspileOnlyDeclarationFile.
      path.basename(transpileFileName),
      contents,
      compilerOptions,
    );
  }

  return { outputText, sourceMapText, configParseErrorMessage: undefined };
}

/**
 * Emits a single file's declaration output via `api.transpileDeclaration`,
 * for transpileOnly + `isolatedDeclarations` projects - see the call site in
 * getTranspileOnlyEmit. Unlike `program.getDeclarationEmit` (used by
 * recordProjectDeclarationFiles for full compiles), this returns raw text
 * rather than a named output file, so the output path has to be computed
 * here instead of read off the API's response.
 *
 * Emitted directly via `loaderContext.emitFile` rather than
 * `instance.pendingDeclarationFiles` - unlike the full-compile path, there's
 * no afterCompile-equivalent hook to flush that map later: addPostCompileHooks
 * (which wires up emitPendingDeclarationFiles) is only registered for
 * non-transpileOnly instances, since transpileOnly's diagnostics are already
 * reported immediately rather than deferred.
 */
function recordTranspileOnlyDeclarationFile(
  instance: TSInstance,
  typeScriptInstance: TypeScriptApiInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  fileName: string,
  // A bare basename, not a full path - unlike transpileModule (which needs
  // fileName's real directory for e.g. rootDir-containment diagnostics; see
  // its own transpileFileName), transpileDeclaration panics on Windows
  // ("mixed posix and windows paths") given *any* absolute path here,
  // whether OS-native or forward-slash-normalized - something server-side
  // still derives a conflicting path style from it either way. A bare
  // basename sidesteps that: transpileDeclaration's own diagnostics
  // (isolatedDeclarations violations like TS9011) are purely syntactic and
  // don't need real directory context, and any real rootDir-containment
  // diagnostic for this same file is already covered by transpileModule's
  // call in getTranspileOnlyEmit.
  transpileFileName: string,
  contents: string,
  compilerOptions: CompilerOptions,
) {
  const { outputText, sourceMapText, diagnostics = [] } =
    typeScriptInstance.api.transpileDeclaration(contents, {
      compilerOptions,
      fileName: transpileFileName,
      reportDiagnostics: true,
    });

  const declarationErrors = filterDiagnosticsForReporting(
    instance,
    loaderContext.context,
    dedupeDiagnostics(diagnostics),
  ).map(diagnostic =>
    buildTypeScriptError(
      instance,
      diagnostic,
      makeSingleFileLocationSource(transpileFileName, contents),
      loaderContext.context,
      loaderContext._module,
      '',
      fileName,
    ),
  );

  reportTypeScriptErrors(loaderContext, declarationErrors);

  const outputPath = loaderContext._compilation?.compiler.outputPath;
  if (outputPath === undefined) {
    return;
  }

  const declarationFileName = computeDeclarationFilePath(
    fileName,
    compilerOptions,
  );
  const assetPath = path
    .relative(outputPath, declarationFileName)
    .replace(/\\/g, '/');

  loaderContext.emitFile(assetPath, outputText);

  if (sourceMapText !== undefined) {
    loaderContext.emitFile(`${assetPath}.map`, sourceMapText);
  }
}

/** See the comment at its call site in getTranspileOnlyEmit. */
function omitIsolatedDeclarations(
  compilerOptions: CompilerOptions,
): CompilerOptions {
  const { isolatedDeclarations: _isolatedDeclarations, ...rest } =
    compilerOptions;
  return rest;
}

/**
 * Mirrors TypeScript's own source-to-declaration extension swap (`.ts` ->
 * `.d.ts`, `.tsx` -> `.d.ts`, `.mts`/`.cts` -> `.d.mts`/`.d.cts`).
 */
function toDeclarationFileName(fileName: string): string {
  const match = /\.(mts|cts|tsx|ts)$/i.exec(fileName);

  if (!match) {
    return `${fileName}.d.ts`;
  }

  const base = fileName.slice(0, -match[0].length);
  const ext = match[1].toLowerCase();
  const declarationExt = ext === 'mts' ? 'mts' : ext === 'cts' ? 'cts' : 'ts';

  return `${base}.d.${declarationExt}`;
}

/**
 * Computes where a single file's declaration output belongs, remapping it
 * from `rootDir` to `declarationDir`/`outDir` the same way
 * `program.getDeclarationEmit` does for a full compile - but only when both
 * are explicitly set: `rootDir` left unset is normally inferred by
 * TypeScript from the full set of a project's root files (their lowest
 * common ancestor directory), which isn't something a single-file,
 * program-less transform can replicate. Declarations fall back to sitting
 * beside their source in that case, matching TypeScript's own default
 * (no `declarationDir`/`outDir`) placement.
 */
function computeDeclarationFilePath(
  fileName: string,
  compilerOptions: CompilerOptions,
): string {
  const declarationFileName = toDeclarationFileName(fileName);
  const outDirLikeOption =
    compilerOptions.declarationDir ?? compilerOptions.outDir;

  if (!outDirLikeOption || !compilerOptions.rootDir) {
    return declarationFileName;
  }

  const relativeToRoot = path.relative(
    compilerOptions.rootDir,
    declarationFileName,
  );

  return path.join(outDirLikeOption, relativeToRoot);
}

function loadTypeScriptApiModule(compilerPackage: string): TypeScriptApiModule {
  const specifier = `${compilerPackage}/unstable/sync`;

  try {
    return require(specifier) as TypeScriptApiModule;
  } catch (error) {
    throw new Error(
      `Could not load TypeScript typeScript API from "${specifier}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function updateSnapshot(
  typeScriptInstance: TypeScriptApiInstance,
  fileName: string,
  openProjects?: string[],
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
      : { openFiles: [fileName], fileChanges },
  );

  typeScriptInstance.snapshot = snapshot;
  openProjects?.forEach(projectPath =>
    typeScriptInstance.openedProjectPaths.add(projectPath),
  );
  previousSnapshot?.dispose?.();

  return snapshot;
}

/**
 * Opens (or reuses the already-open) primary project - the one configured
 * project ts-loader itself resolved via `configFilePath` - and returns its
 * `Project`, if it parsed successfully. Shared by `prepareSnapshotForFile`
 * (which may go on to fall back to a per-file synthetic project) and
 * `getTranspileOnlyEmit` (which never needs to, since a program-less
 * transform doesn't care whether `fileName` is actually one of this
 * project's own files).
 */
function openPrimaryProject(
  typeScriptInstance: TypeScriptApiInstance,
  fileName: string,
) {
  const primaryProjectPath = typeScriptInstance.configFilePath;
  const snapshot = updateSnapshot(
    typeScriptInstance,
    fileName,
    typeScriptInstance.openedProjectPaths.has(primaryProjectPath)
      ? undefined
      : [primaryProjectPath],
  );

  return {
    snapshot,
    primaryProjectPath,
    primaryProject: snapshot.getProject(primaryProjectPath),
  };
}

function prepareSnapshotForFile(
  typeScriptInstance: TypeScriptApiInstance,
  fileName: string,
  forceSyntheticRoot: boolean,
) {
  const { snapshot, primaryProjectPath, primaryProject } = openPrimaryProject(
    typeScriptInstance,
    fileName,
  );

  if (
    !forceSyntheticRoot &&
    primaryProject?.program.getSourceFile(fileName)
  ) {
    return { snapshot, projectConfigPath: primaryProjectPath };
  }

  // A tsconfig that fails to parse at all (e.g. an `include` pattern
  // matching no files) is a hard failure classic ts-loader surfaces
  // directly - falling back to a synthetic config below would silently
  // paper over that by explicitly listing `fileName`, bypassing whatever
  // broke the primary config's own file resolution. Sticking with the
  // (broken) primary project here instead lets the caller's config-parsing
  // diagnostics check see the real error.
  if (
    primaryProject &&
    primaryProject.program.getConfigFileParsingDiagnostics().length > 0
  ) {
    return { snapshot, projectConfigPath: primaryProjectPath };
  }

  const syntheticConfigPath = ensureSyntheticConfigForFile(
    typeScriptInstance,
    primaryProjectPath,
    primaryProject?.parsedCommandLine.fileNames ?? [],
    fileName,
  );
  const syntheticSnapshot = updateSnapshot(
    typeScriptInstance,
    fileName,
    typeScriptInstance.openedProjectPaths.has(syntheticConfigPath)
      ? undefined
      : [syntheticConfigPath],
  );

  return {
    snapshot: syntheticSnapshot,
    projectConfigPath: syntheticConfigPath,
  };
}

function ensureSyntheticConfigForFile(
  typeScriptInstance: TypeScriptApiInstance,
  configFilePath: string,
  rootFiles: readonly string[],
  fileName: string,
) {
  const existing = typeScriptInstance.syntheticConfigFiles.get(fileName);
  if (existing) {
    return existing;
  }

  // A sibling of the real config, so its directory always already exists on
  // disk - see the comment on syntheticConfigContents in
  // createTypeScriptApiInstance for why that means this never needs to
  // touch real disk. Being colocated with the real config it extends also
  // means two different projects' synthetic configs can never land in the
  // same directory, let alone collide on the same path.
  const syntheticConfigPath = path.join(
    path.dirname(configFilePath),
    `.${path.basename(configFilePath, '.json')}.ts-loader.${hashFileName(
      fileName,
    )}.json`,
  );
  const files = [...new Set([...rootFiles, fileName])].sort();
  const configText = JSON.stringify(
    {
      extends: configFilePath,
      files,
    },
    null,
    2,
  );
  // Stored under the comparable (forward-slash) form so the `readFile`
  // override in createTypeScriptApiInstance finds it regardless of which
  // spelling the API's internals hand back for this same path - see that
  // override's own comment. `syntheticConfigFiles` (this function's own
  // fileName -> syntheticConfigPath cache) and the returned `syntheticConfigPath`
  // itself stay OS-native: they're never compared against the API's internal
  // path spelling, only used as opaque identifiers for later `getProject`/
  // `openProjects` calls, which already tolerate either separator style.
  typeScriptInstance.syntheticConfigContents.set(
    toComparablePath(syntheticConfigPath),
    configText,
  );
  typeScriptInstance.syntheticConfigFiles.set(fileName, syntheticConfigPath);
  return syntheticConfigPath;
}

function hashFileName(fileName: string) {
  return crypto.createHash('sha1').update(fileName).digest('hex').slice(0, 12);
}

/**
 * The identity to use for every TypeScript-API-facing call (opening/parsing
 * the file, emit, diagnostics) - as opposed to `fileName` itself, which is
 * what's reported back to webpack (dependencies, error locations).
 *
 * A file with an extension TypeScript doesn't recognize - e.g. a Vue SFC's
 * `<script>` block, extracted and handed to ts-loader by vue-loader before
 * we ever see it (see the `readFile` override in createTypeScriptApiInstance)
 * - has no inferrable ScriptKind, and unlike classic ts-loader's
 * `ts.LanguageService` (which defaults an unrecognized extension to TS) this
 * API panics outright instead. There's no host-level lever to specify
 * ScriptKind directly (checked: no such option on `openFiles`/`openProjects`/
 * the config JSON), so the only way to give it a file it can make sense of is
 * a virtual, `.ts`-suffixed alias - served via the same in-memory `readFile`
 * override as the synthetic config itself, real disk untouched. Appending
 * (rather than replacing the extension) keeps the file in its real directory,
 * so relative import resolution still works. A no-op for any file whose
 * extension TypeScript already understands.
 */
function toApiFacingFileName(fileName: string) {
  return constants.tsTsxJsJsxRegex.test(fileName) ||
    constants.jsonRegex.test(fileName)
    ? fileName
    : `${fileName}.ts`;
}

function getOutputAndSourceMapFromTypeScriptEmit(
  emitResult: TypeScriptEmitOutput,
) {
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
  apiFileName: string,
  instance: TSInstance,
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
      otherFileName === apiFileName ||
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
      // `otherFileName` (from program.getSourceFileNames()) is in the API's
      // forward-slash-normalized form, but webpack's addDependency requires
      // an OS-native absolute path - on Windows it otherwise rejects the
      // dependency outright ("All reported dependencies need to be absolute
      // paths"), the same issue getDirectResolvedImports' own return value
      // has to avoid (see its comment).
      addDependency(path.normalize(otherFileName));
    }
  }

  // Cross-file dependency tracking is only meaningful for a full,
  // type-checked compile: transpileOnly mode never looks at another file's
  // types (matching classic ts-loader's isolated `transpileModule`
  // behaviour), so a dependency's content genuinely can't affect this file's
  // transpiled output, and shouldn't force a rebuild of it.
  if (!instance.loaderOptions.transpileOnly) {
    registerResolvedImportDependencies(program, apiFileName, addDependency);
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
      dependencies.map(dependencyFileName =>
        getDependencyVersionTag(instance, program, dependencyFileName),
      );
  }
}

/**
 * A `"<file>@<version>"` tag that changes whenever `dependencyFileName`'s
 * content genuinely changes, for use in `buildMeta.tsLoaderDefinitionFileVersions`.
 *
 * Most dependencies (anything ts-loader's own webpack rule compiles) have a
 * tracked version in `instance.files`, bumped whenever their content changes
 * (see `updateFileInCache`). But some project files - e.g. an ambient global
 * .d.ts that's only listed in tsconfig's `files` and never `require`d/
 * `import`ed by anything - are never passed through ts-loader's own loader at
 * all, so they never get a tracked version there. For those, hash the
 * program's current view of the file's content instead, so a genuine change
 * is still detected.
 */
function getDependencyVersionTag(
  instance: TSInstance,
  program: TypeScriptProgram,
  dependencyFileName: string,
): string {
  const file = instance.files.get(
    instance.filePathKeyMapper(dependencyFileName),
  );
  if (file) {
    return `${dependencyFileName}@${file.version}`;
  }

  const sourceFile = program.getSourceFile(dependencyFileName);
  const text = sourceFile
    ? (sourceFile as unknown as { text?: string }).text
    : undefined;

  const versionTag =
    text === undefined
      ? '?'
      : crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);

  return `${dependencyFileName}@${versionTag}`;
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
  addDependency: (dependencyFileName: string) => void,
) {
  for (const dependencyFileName of getDirectResolvedImports(
    program,
    fileName,
  )) {
    addDependency(dependencyFileName);
  }
}

/**
 * The other project files `fileName` actually imports via a relative
 * specifier (e.g. `./dep1`) - see registerResolvedImportDependencies, which
 * this also backs, for why bare/unresolved specifiers are excluded.
 */
function getDirectResolvedImports(
  program: TypeScriptProgram,
  fileName: string,
): string[] {
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    return [];
  }

  // A forward-slash-normalized form of each name (see toComparablePath) -
  // the API's own source file names are always forward-slash-normalized
  // internally (the long-standing TypeScript compiler convention, true on
  // every OS including Windows), but resolveRelativeSpecifier below builds
  // its candidate via Node's `path` module, which is OS-native and
  // backslash-separated on Windows. Comparing the two directly would
  // silently never match there. Used only to test *membership* - the
  // candidate path actually returned/used below stays in the OS-native form
  // Node's `path` module produced, matching every other identifier this
  // file threads through (`fileName`, `changedFileName`, webpack's own
  // `addDependency`), unlike the API's own internal spelling.
  const comparableSourceFileNames = new Set(
    program.getSourceFileNames().map(toComparablePath),
  );
  const fromDir = path.dirname(fileName);
  const resolvedImports: string[] = [];

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
      comparableSourceFileNames,
    );

    if (resolvedFileName && resolvedFileName !== fileName) {
      resolvedImports.push(resolvedFileName);
    }
  }

  return resolvedImports;
}

/**
 * Recomputes and stores fresh diagnostics for every project file that
 * (directly or transitively) imports `changedFileName`, so a type-check
 * affected by this file's change is reported even for a dependant whose own
 * module webpack has no reason to rebuild (see the call site).
 */
function recheckTransitiveDependants(
  instance: TSInstance,
  program: TypeScriptProgram,
  changedFileName: string,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
) {
  const projectFileNames = program.getSourceFileNames().filter(otherFileName => {
    const sourceFile = program.getSourceFile(otherFileName);
    return (
      sourceFile &&
      !program.isSourceFileDefaultLibrary(sourceFile) &&
      !program.isSourceFileFromExternalLibrary(sourceFile)
    );
  });

  const dependants = findTransitiveDependants(
    program,
    changedFileName,
    projectFileNames,
  );

  if (dependants.size === 0) {
    return;
  }

  // The compilation already knows about every module from prior builds, even
  // ones not being rebuilt this round, so a dependant's module can be looked
  // up here despite this running from a *different* file's own loader
  // invocation - tagging the error with it (like the normal, single-file
  // path does) so webpack's stats can show its "./<file> <loc>" line.
  const modulesByFile = loaderContext._compilation
    ? determineModulesByFile(loaderContext._compilation, instance)
    : undefined;

  for (const dependantFileName of dependants) {
    const diagnostics = dedupeDiagnostics([
      ...program.getSyntacticDiagnostics(dependantFileName),
      ...program.getSemanticDiagnostics(dependantFileName),
    ]);

    const dependantModule = modulesByFile
      ?.get(instance.filePathKeyMapper(dependantFileName))
      ?.[0];

    const errors = filterDiagnosticsForReporting(
      instance,
      loaderContext.context,
      diagnostics,
    ).map(diagnostic =>
      buildTypeScriptError(
        instance,
        diagnostic,
        program,
        loaderContext.context,
        dependantModule,
      ),
    );

    instance.pendingDiagnostics.set(
      instance.filePathKeyMapper(dependantFileName),
      { fileName: dependantFileName, errors },
    );
  }
}

/**
 * Every project file that (directly or transitively) imports `changedFileName`,
 * found by breadth-first search over each candidate file's own direct
 * resolved imports (see getDirectResolvedImports).
 */
function findTransitiveDependants(
  program: TypeScriptProgram,
  changedFileName: string,
  projectFileNames: readonly string[],
): Set<string> {
  // `projectFileNames` entries (from program.getSourceFileNames()) are
  // already in the API's own forward-slash-normalized form, so they're used
  // as-is both as the map key and as `dependants`/frontier members below.
  // `getDirectResolvedImports` returns OS-native paths (see its own comment)
  // and so does `changedFileName` (ultimately from webpack's resourcePath),
  // so both need normalizing before they're compared against those
  // forward-slash frontier members - otherwise a multi-hop dependant (e.g.
  // `app.ts` importing `dep.ts` importing `deeperDep.ts`) would never match
  // on the second hop on Windows, even though the first hop happens to line
  // up (frontier's initial seed and getDirectResolvedImports' return value
  // are both OS-native there).
  const directImportsByFile = new Map(
    projectFileNames.map(candidateFileName => [
      candidateFileName,
      getDirectResolvedImports(program, candidateFileName).map(
        toComparablePath,
      ),
    ]),
  );

  const comparableChangedFileName = toComparablePath(changedFileName);
  const dependants = new Set<string>();
  let frontier = new Set([comparableChangedFileName]);

  while (frontier.size > 0) {
    const nextFrontier = new Set<string>();

    for (const [candidateFileName, directImports] of directImportsByFile) {
      if (
        dependants.has(candidateFileName) ||
        candidateFileName === comparableChangedFileName
      ) {
        continue;
      }

      if (directImports.some(importedFileName => frontier.has(importedFileName))) {
        dependants.add(candidateFileName);
        nextFrontier.add(candidateFileName);
      }
    }

    frontier = nextFrontier;
  }

  return dependants;
}

const relativeSpecifierExtensions = ['', '.ts', '.tsx', '.d.ts', '.js', '.jsx'];

function resolveRelativeSpecifier(
  fromDir: string,
  specifier: string,
  comparableSourceFileNames: ReadonlySet<string>,
): string | undefined {
  const resolvedBase = path.resolve(fromDir, specifier);

  for (const extension of relativeSpecifierExtensions) {
    const candidate = resolvedBase + extension;
    if (comparableSourceFileNames.has(toComparablePath(candidate))) {
      return candidate;
    }
  }

  for (const extension of relativeSpecifierExtensions) {
    const candidate = path.join(resolvedBase, `index${extension}`);
    if (comparableSourceFileNames.has(toComparablePath(candidate))) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Forward-slash-normalized form of a file name, for comparing against the
 * TypeScript API's own source file names - see the comment on
 * comparableSourceFileNames in getDirectResolvedImports for why the
 * two can otherwise disagree on Windows.
 */
function toComparablePath(fileName: string): string {
  return fileName.replace(/\\/g, '/');
}

/**
 * Emits declarations for every source file in the project matching the given
 * compiler options' allowJs setting - not just the file currently being
 * compiled - matching classic ts-loader's `provideDeclarationFilesToWebpack`.
 */
function recordProjectDeclarationFiles(
  instance: TSInstance,
  program: TypeScriptProgram,
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
      declarationFiles,
    );
  }
}

function reportTypeScriptErrors(
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
      instance.filePathKeyMapper(fileName),
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

function filterDiagnosticsForReporting(
  instance: TSInstance,
  context: string,
  diagnostics: readonly TypeScriptDiagnostic[],
): TypeScriptDiagnostic[] {
  const matchesReportFiles = makeReportFilesMatcher(
    instance.loaderOptions.reportFiles,
  );

  return diagnostics.filter(diagnostic => {
    if (instance.loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) !== -1) {
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
 * Builds a file-matcher from a `reportFiles` pattern array that replicates
 * micromatch/picomatch semantics: a file must match a positive pattern AND
 * not match any negative (`!`-prefixed) pattern. Returns `null` when
 * `reportFiles` is empty (no filtering).
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

function buildTypeScriptError(
  instance: TSInstance,
  diagnostic: TypeScriptDiagnostic,
  program: DiagnosticLocationSource,
  context: string,
  module: webpack.Module | undefined,
  fallbackFile = '',
  // Set only when `diagnostic` was fetched using a synthetic, API-facing
  // file identity (see toApiFacingFileName) rather than the file's real
  // path - e.g. a Vue SFC's extracted <script> block. `getDiagnosticLocations`
  // below still needs the *original* `diagnostic.fileName` to resolve a
  // location via `program` (that's the only identity `program` recognizes),
  // but the path shown to the user, and used for the webpack error's own
  // file/module attribution, should be the real one.
  displayFileName?: string,
) {
  // `fallbackFile` is only ever passed for config-file-parsing/whole-program
  // diagnostics (see call sites below), which classic ts-loader treats as
  // having no file of their own - `diagnostic.file` is always `undefined`
  // for these in classic TypeScript, so the formatted message leaves `file`
  // empty and `fallbackFile` only affects the *webpack error's own*
  // `.file`/module attribution further down (classic's split between
  // `ErrorInfo.file`, from the diagnostic, and the `merge.file` passed to
  // `makeError`, from the caller). TypeScript 7 does attach a `fileName`
  // and position to these same diagnostics (pointing at the offending
  // option's spot in tsconfig.json) where classic's compiler doesn't, so
  // that has to be deliberately ignored here for message purposes to match
  // classic's output exactly.
  const hasFallbackFile = fallbackFile !== '';
  const { start, end } = hasFallbackFile
    ? { start: undefined, end: undefined }
    : getDiagnosticLocations(diagnostic, program);
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
  instance: TSInstance,
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

interface LineAndCharacter {
  line: number;
  character: number;
}

/**
 * Whatever `getDiagnosticLocations` needs to resolve a diagnostic's
 * `pos`/`end` offsets into a line/character: either a real `Program` (for
 * diagnostics from a program-based compile) or `makeSingleFileLocationSource`'s
 * text-backed stand-in (for `transpileModule`/`transpileDeclaration`
 * diagnostics, which have no program at all).
 */
interface DiagnosticLocationSource {
  getSourceFile(fileName: string):
    | {
        getLineAndCharacterOfPosition(pos: number): LineAndCharacter;
      }
    | undefined;
};

/**
 * A `DiagnosticLocationSource` for a single file's raw text, computing
 * line/character directly rather than via a `Program` - see its use in
 * getTranspileOnlyEmit and recordTranspileOnlyDeclarationFile, whose
 * diagnostics (from `transpileModule`/`transpileDeclaration`) never have a
 * program to ask instead.
 */
function makeSingleFileLocationSource(
  fileName: string,
  text: string,
): DiagnosticLocationSource {
  return {
    getSourceFile: candidateFileName =>
      candidateFileName === fileName
        ? {
            getLineAndCharacterOfPosition: pos =>
              computeLineAndCharacterFromText(text, pos),
          }
        : undefined,
  };
}

function computeLineAndCharacterFromText(text: string, pos: number): LineAndCharacter {
  let line = 0;
  let lineStart = 0;

  for (let i = 0; i < pos && i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++;
      lineStart = i + 1;
    }
  }

  return { line, character: pos - lineStart };
}

function getDiagnosticLocations(
  diagnostic: TypeScriptDiagnostic,
  program: DiagnosticLocationSource,
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
            diagnostic.end,
          );
          return { line: endLC.line + 1, character: endLC.character + 1 };
        })()
      : undefined;

  return { start, end };
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
