import * as crypto from 'crypto';
import * as path from 'path';
import picomatch from 'picomatch';
import * as webpack from 'webpack';
import type {
  API as SyncApi,
  APIOptions,
  CompilerOptions,
  Diagnostic,
  EmitOutput,
  Program,
} from 'typescript/unstable/sync';

import * as constants from './constants';
import type { Colors } from './colors';
import type {
  ErrorInfo,
  FileLocation,
  FilePathKey,
  LoaderOptions,
  PendingDeclarationFile,
  TypeScriptInstance as TypeScriptApiInstance,
  Severity,
  TSInstance,
  ResolvedPathCache,
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
  API: new (options?: APIOptions) => SyncApi;
};

export function createTypeScriptApiInstance(
  loaderOptions: LoaderOptions,
  configFilePath: string,
  files: TSInstance['files'],
  resolvedPathCache: ResolvedPathCache,
): TypeScriptApiInstance {
  const typeScriptApiModule = loadTypeScriptApiModule(loaderOptions.compiler);

  // Served entirely via the `readFile` override below - never written to
  // real disk (see ensureSyntheticConfigForFile).
  const syntheticConfigContents = new Map<string, string>();

  return {
    // Serves ts-loader's own post-transform file content (other loaders may
    // have altered it) instead of hitting real disk; falls through
    // (`undefined`) for anything not in `files`, matching classic
    // ts-loader's LanguageServiceHost.
    api: new typeScriptApiModule.API({
      fs: {
        // Without this, a purely synthetic identity (e.g. `component.vue.ts`)
        // reports "File not found" (TS6053) even though readFile can serve
        // it. `true`/`undefined`, not `false`, so anything else still falls
        // through to real disk.
        fileExists: fileName =>
          syntheticConfigContents.has(toComparablePath(fileName)) ||
          files.has(resolvedPathCache(fileName))
            ? true
            : undefined,
        // toComparablePath since the API may hand back a different path
        // spelling than what this was stored under.
        readFile: fileName =>
          syntheticConfigContents.get(toComparablePath(fileName)) ??
          files.get(resolvedPathCache(fileName))?.text,
      },
    }),
    configFilePath,
    syntheticConfigContents,
    syntheticConfigFiles: new Map(),
    openedProjectPaths: new Set(),
    pendingInvalidation: true,
    directImportsCache: new Map(),
  };
}

export function getTypeScriptEmit(
  fileName: string,
  contents: string,
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
) {
  // See toApiFacingFileName - used for every call into the TypeScript API
  // below; `fileName` itself is reserved for what's reported back to webpack
  // or shown to the user.
  const apiFileName = toApiFacingFileName(fileName);

  // transpileModule/transpileDeclaration are program-less, single-file
  // transforms (matching classic ts-loader's transpileOnly behaviour), so
  // none of the synthetic-root machinery below - needed only to satisfy
  // program.getJavaScriptEmit's root-file requirement - applies here.
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
  // The API skips emit for a node_modules file unless it's an explicit root
  // (matching classic ts-loader's default refusal to compile .ts there);
  // `allowTsInNodeModules` opts in via the synthetic single-file project
  // fallback below, which does list it as a root.
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
  // Captured here rather than thrown so index.ts's `loader` can reconstruct
  // the Error in its own stack frame, matching classic ts-loader's
  // single-frame stack trace for this failure.
  let configParseErrorMessage: string | undefined;

  typeScriptInstance.api.runWithTemporaryFileUpdate(
    snapshot,
    apiFileName,
    contents,
    temporarySnapshot => {
      // Prefer the project ts-loader explicitly resolved over the API's own
      // nearest-tsconfig auto-discovery, which can pick an unrelated
      // tsconfig.json that happens to sit closer to `fileName` on disk.
      const configuredProject = temporarySnapshot.getProject(projectConfigPath);
      // A configured project that failed to parse at all is a hard failure
      // to surface as-is, not a reason to silently fall back to a different
      // project that happens to resolve `fileName`.
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
        // A broken tsconfig is a hard failure in classic ts-loader too:
        // there's nothing left to compile, so report the diagnostic(s) then
        // throw, which webpack surfaces as a "Module build failed" error.
        const configErrors = filterDiagnosticsForReporting(
          instance,
          loaderContext.context,
          dedupeDiagnostics(configFileParsingDiagnostics),
        ).map(diagnostic =>
          buildTypeScriptError(
            instance,
            diagnostic,
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

      const errors = filterDiagnosticsForReporting(
        instance,
        loaderContext.context,
        perFileDiagnostics,
      ).map(diagnostic =>
        buildTypeScriptError(
          instance,
          diagnostic,
          loaderContext.context,
          loaderContext._module,
          '',
          fileName,
        ),
      );

      // Deferred to processAssets (see reportPendingTypeScriptDiagnostics in
      // index.ts) so we can tell whether webpack already recorded its own
      // error for this module and avoid double-counting.
      instance.pendingDiagnostics.set(instance.resolvedPathCache(fileName), {
        fileName,
        errors,
      });

      // A dependant's diagnostics can change without its own module
      // rebuilding, and webpack has no reason to re-invoke ts-loader for it -
      // recheck explicitly, matching classic's afterCompile re-check. Only
      // meaningful against the primary project: a synthetic one-off project
      // uses the wrong compiler options/import graph for any other file.
      if (projectConfigPath === typeScriptInstance.configFilePath) {
        recheckTransitiveDependants(
          instance,
          program,
          apiFileName,
          loaderContext,
        );
      }

      // Read out synchronously for the same reason as `errors` above;
      // emitted as webpack assets later by emitPendingDeclarationFiles.
      if (
        program.getCompilerOptions().declaration ||
        program.getCompilerOptions().composite
      ) {
        // Scans the whole project (e.g. an allowJs .js file never passes
        // through ts-loader's own webpack rule), matching classic's
        // provideDeclarationFilesToWebpack.
        recordProjectDeclarationFiles(instance, program);
      }
    },
  );

  return { outputText, sourceMapText, configParseErrorMessage };
}

/**
 * transpileOnly's emit path, built on `api.transpileModule` (and, for
 * `isolatedDeclarations` projects, `api.transpileDeclaration`) rather than
 * `getTypeScriptEmit`'s program-based `program.getJavaScriptEmit`. Both are
 * program-less single-file transforms, so only the project's resolved
 * compiler options are needed, not its root files.
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
    // See the equivalent check in getTypeScriptEmit.
    const configErrors = filterDiagnosticsForReporting(
      instance,
      loaderContext.context,
      dedupeDiagnostics(configFileParsingDiagnostics),
    ).map(diagnostic =>
      buildTypeScriptError(
        instance,
        diagnostic,
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

  // Unlike every other API call in this file, transpileModule/
  // transpileDeclaration build their own virtual filesystem from `fileName`
  // verbatim rather than resolving it through a `Project` - an OS-native
  // path panics on Windows ("mixed posix and windows paths") once combined
  // with the API's forward-slash-normalized internal paths. See
  // toComparablePath.
  const transpileFileName = toComparablePath(apiFileName);

  const compilerOptions = program.getCompilerOptions();
  const { outputText, sourceMapText, diagnostics = [] } =
    typeScriptInstance.api.transpileModule(contents, {
      compilerOptions,
      fileName: transpileFileName,
      reportDiagnostics: true,
    });

  // Classic ts-loader's transpileOnly path also surfaces whole-program
  // diagnostics (e.g. "rootDir must be explicitly set"); transpileModule
  // has no project of its own to derive these from, so pull them from the
  // resolved project directly.
  const programDiagnostics = dedupeDiagnostics(
    program.getProgramDiagnostics(),
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
        loaderContext.context,
        loaderContext._module,
        '',
        fileName,
      ),
    ),
    // Program diagnostics have no associated file (classic attributes them
    // to the tsconfig instead).
    ...filterDiagnosticsForReporting(
      instance,
      loaderContext.context,
      programDiagnostics,
    ).map(diagnostic =>
      buildTypeScriptError(
        instance,
        diagnostic,
        loaderContext.context,
        loaderContext._module,
        primaryProjectPath,
      ),
    ),
  ];

  // No type-checking to wait for in transpileOnly mode, so report
  // immediately, matching classic ts-loader.
  reportTypeScriptErrors(loaderContext, errors);

  registerTypeScriptDependencies(
    loaderContext,
    program,
    fileName,
    apiFileName,
    instance,
  );

  // transpileDeclaration is the only way transpileOnly can produce .d.ts
  // output: the full, type-checked program.getDeclarationEmit path needs a
  // checker transpileOnly never runs.
  if (
    (compilerOptions.declaration || compilerOptions.composite) &&
    compilerOptions.isolatedDeclarations
  ) {
    recordTranspileOnlyDeclarationFile(
      instance,
      typeScriptInstance,
      loaderContext,
      fileName,
      transpileFileName,
      contents,
      compilerOptions,
    );
  }

  return { outputText, sourceMapText, configParseErrorMessage: undefined };
}

/**
 * Emits a single file's declaration output via `api.transpileDeclaration`.
 * Unlike `program.getDeclarationEmit`, this returns raw text rather than a
 * named output file, so the output path is computed here. Emitted directly
 * via `loaderContext.emitFile` rather than `instance.pendingDeclarationFiles`,
 * since transpileOnly instances never register addPostCompileHooks (their
 * diagnostics are reported immediately, not deferred).
 */
function recordTranspileOnlyDeclarationFile(
  instance: TSInstance,
  typeScriptInstance: TypeScriptApiInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  fileName: string,
  // Forward-slash-normalized (see transpileFileName's own comment at the
  // call site in getTranspileOnlyEmit).
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
 * Remaps a declaration file from `rootDir` to `declarationDir`/`outDir`,
 * like `program.getDeclarationEmit` does - only when both are set, since an
 * unset `rootDir` is normally inferred from a project's full root file set,
 * which a single-file transform can't replicate.
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
  // `invalidateAll` forces a full rescan: ts-loader only knows about the one
  // file webpack asked it to compile, not whether other project files
  // changed on disk since the last snapshot. Only needed once per build/watch
  // rebuild (see `pendingInvalidation` and its `compile`-hook wiring in
  // index.ts) - every other file compiled within the same build reuses the
  // snapshot that call already refreshed.
  const fileChanges = typeScriptInstance.pendingInvalidation
    ? ({ invalidateAll: true } as const)
    : undefined;
  if (typeScriptInstance.pendingInvalidation) {
    // A real rescan can change any file's content, so import lists cached
    // from the previous build can no longer be trusted - see
    // findTransitiveDependants/directImportsCache.
    typeScriptInstance.directImportsCache.clear();
  }
  typeScriptInstance.pendingInvalidation = false;
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
 * Opens (or reuses) the primary project - the one configured project
 * ts-loader resolved via `configFilePath`. Shared by `prepareSnapshotForFile`
 * (which may fall back to a synthetic project) and `getTranspileOnlyEmit`.
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

  // A tsconfig that fails to parse is a hard failure classic ts-loader
  // surfaces directly - falling back to a synthetic config would silently
  // paper over it by explicitly listing `fileName`.
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
  // disk - see syntheticConfigContents in createTypeScriptApiInstance.
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
  // Stored under the comparable (forward-slash) form so `readFile` above
  // finds it regardless of path spelling; `syntheticConfigFiles`/
  // `syntheticConfigPath` stay OS-native, used only as opaque ids for later
  // `getProject`/`openProjects` calls.
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
 * The identity used for every TypeScript-API-facing call, as opposed to
 * `fileName` itself, which is what's reported to webpack/the user. A file
 * with an unrecognized extension (e.g. a Vue SFC's extracted `<script>`
 * block) has no inferrable ScriptKind and this API rejects it outright,
 * unlike classic ts-loader's `ts.LanguageService` (which defaults to TS).
 * With no host-level way to set ScriptKind, alias to a virtual
 * `.ts`-suffixed name instead (served via the same `readFile` override as
 * the synthetic config) - appended, not replacing, so relative imports still
 * resolve from the real directory. A no-op for any recognized extension.
 */
function toApiFacingFileName(fileName: string) {
  return constants.tsTsxJsJsxRegex.test(fileName) ||
    constants.jsonRegex.test(fileName)
    ? fileName
    : `${fileName}.ts`;
}

function getOutputAndSourceMapFromTypeScriptEmit(
  emitResult: EmitOutput,
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
  program: Program,
  fileName: string,
  apiFileName: string,
  instance: TSInstance,
) {
  loaderContext.clearDependencies();
  loaderContext.addDependency(fileName);

  // Every *other* file this one is made dependent on below, tracked
  // separately so their versions can be baked into this module's buildMeta
  // afterwards (see getDependencyVersionTag below).
  const dependencies: string[] = [];
  const addDependency = (dependencyFileName: string) => {
    loaderContext.addDependency(dependencyFileName);
    dependencies.push(dependencyFileName);
  };

  // Every .d.ts in the program is added as a dependency, since it can
  // affect type-checking without necessarily being in webpack's own module
  // graph. Regular source files are scoped to this file's own resolved
  // imports instead (see registerResolvedImportDependencies below) - adding
  // every source file here would make every file depend on every other one.
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
      // `otherFileName` is forward-slash-normalized; webpack's
      // addDependency requires an OS-native absolute path or it rejects the
      // dependency outright on Windows.
      addDependency(path.normalize(otherFileName));
    }
  }

  // transpileOnly never looks at another file's types, so a dependency's
  // content can't affect this file's transpiled output.
  if (!instance.loaderOptions.transpileOnly) {
    const comparableSourceFileNames = new Set(
      program.getSourceFileNames().map(toComparablePath),
    );
    registerResolvedImportDependencies(
      instance.typeScriptApiInstance,
      program,
      apiFileName,
      comparableSourceFileNames,
      addDependency,
    );
  }

  // `getConfigFileNames` is forward-slash-normalized like
  // `getSourceFileNames` above - same Windows requirement applies.
  for (const configFileName of program.getConfigFileNames()) {
    const normalizedConfigFileName = path.normalize(configFileName);
    if (isWebpack5) {
      loaderContext.addBuildDependency(normalizedConfigFileName);
    } else {
      loaderContext.addDependency(normalizedConfigFileName);
    }
  }

  // A dependency's content can change this file's diagnostics without
  // changing its own emitted JS - without tagging buildMeta, webpack could
  // reuse a cached result and drop/keep stale diagnostics. Matches classic
  // ts-loader's `buildMeta.tsLoaderDefinitionFileVersions`.
  if (loaderContext._module?.buildMeta !== undefined) {
    loaderContext._module.buildMeta.tsLoaderDefinitionFileVersions =
      dependencies.map(dependencyFileName =>
        getDependencyVersionTag(instance, program, dependencyFileName),
      );
  }
}

/**
 * A `"<file>@<version>"` tag for `buildMeta.tsLoaderDefinitionFileVersions`
 * that changes whenever `dependencyFileName`'s content genuinely changes.
 * Falls back to hashing the program's view of the file when it has no
 * tracked version in `instance.files` (e.g. an ambient .d.ts never
 * imported by anything, so never passed through ts-loader's own loader).
 */
function getDependencyVersionTag(
  instance: TSInstance,
  program: Program,
  dependencyFileName: string,
): string {
  const file = instance.files.get(
    instance.resolvedPathCache(dependencyFileName),
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
 * Makes `fileName` dependent on other project source files it actually
 * imports via a relative specifier (e.g. `./dep1`), matching classic
 * ts-loader's dependency-graph tracking. Bare/absolute specifiers are left
 * alone: webpack's own module graph already tracks genuinely bundled ones,
 * and an unresolved specifier shouldn't force a rebuild on some unrelated
 * file's change (see the aliasResolution test).
 *
 * Always recomputed fresh rather than read from `directImportsCache` -
 * `fileName` may have just been live-edited, so a cached entry (populated by
 * findTransitiveDependants for some other file's dependant search) could be
 * stale. Written back so any other file's search this build sees the
 * up-to-date result too.
 */
function registerResolvedImportDependencies(
  typeScriptInstance: TypeScriptApiInstance,
  program: Program,
  fileName: string,
  comparableSourceFileNames: ReadonlySet<string>,
  addDependency: (dependencyFileName: string) => void,
) {
  const resolvedImports = getDirectResolvedImports(
    program,
    fileName,
    comparableSourceFileNames,
  );
  typeScriptInstance.directImportsCache.set(fileName, resolvedImports);

  for (const dependencyFileName of resolvedImports) {
    addDependency(dependencyFileName);
  }
}

/**
 * Memoized wrapper around `getDirectResolvedImports`, reused across every
 * file compiled in the same build (see `TypeScriptInstance.directImportsCache`)
 * instead of recomputing every project file's imports from scratch on every
 * single compile. Only safe for files *other* than the one currently being
 * compiled - see `registerResolvedImportDependencies`, which always computes
 * fresh for that one and writes the result back here.
 */
function getCachedDirectResolvedImports(
  typeScriptInstance: TypeScriptApiInstance,
  program: Program,
  fileName: string,
  comparableSourceFileNames: ReadonlySet<string>,
): readonly string[] {
  const cached = typeScriptInstance.directImportsCache.get(fileName);
  if (cached) {
    return cached;
  }

  const resolved = getDirectResolvedImports(
    program,
    fileName,
    comparableSourceFileNames,
  );
  typeScriptInstance.directImportsCache.set(fileName, resolved);
  return resolved;
}

/**
 * The other project files `fileName` actually imports via a relative
 * specifier (e.g. `./dep1`) - see registerResolvedImportDependencies for
 * why bare/unresolved specifiers are excluded. `comparableSourceFileNames`
 * (the project's source file names, forward-slash-normalized) is a caller
 * concern - see its call sites - since it's the same for every file checked
 * in a given pass and rebuilding it per file is itself an O(n) cost.
 */
function getDirectResolvedImports(
  program: Program,
  fileName: string,
  comparableSourceFileNames: ReadonlySet<string>,
): string[] {
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    return [];
  }

  // resolveRelativeSpecifier builds its candidate via Node's OS-native
  // `path` module - compared via toComparablePath for membership only, the
  // returned candidate itself stays OS-native.
  const fromDir = path.dirname(fileName);
  const resolvedImports: string[] = [];

  for (const specifierNode of sourceFile.imports) {
    // `imports` is a module specifier expression - a string literal in
    // practice - but the API types it as a generic `Node`, which has no
    // `.text`.
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
 * (directly or transitively) imports `changedFileName`, so a dependant's
 * type-check is reported even when webpack has no reason to rebuild its
 * module (see the call site).
 */
function recheckTransitiveDependants(
  instance: TSInstance,
  program: Program,
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

  const comparableSourceFileNames = new Set(
    program.getSourceFileNames().map(toComparablePath),
  );

  const dependants = findTransitiveDependants(
    instance.typeScriptApiInstance,
    program,
    changedFileName,
    projectFileNames,
    comparableSourceFileNames,
  );

  if (dependants.size === 0) {
    return;
  }

  // Looked up despite running from a different file's own loader
  // invocation, so the error can be tagged with its module for webpack's
  // stats.
  const modulesByFile = loaderContext._compilation
    ? determineModulesByFile(loaderContext._compilation, instance)
    : undefined;

  for (const dependantFileName of dependants) {
    const diagnostics = dedupeDiagnostics([
      ...program.getSyntacticDiagnostics(dependantFileName),
      ...program.getSemanticDiagnostics(dependantFileName),
    ]);

    const dependantModule = modulesByFile
      ?.get(instance.resolvedPathCache(dependantFileName))
      ?.[0];

    const errors = filterDiagnosticsForReporting(
      instance,
      loaderContext.context,
      diagnostics,
    ).map(diagnostic =>
      buildTypeScriptError(
        instance,
        diagnostic,
        loaderContext.context,
        dependantModule,
      ),
    );

    instance.pendingDiagnostics.set(
      instance.resolvedPathCache(dependantFileName),
      { fileName: dependantFileName, errors },
    );
  }
}

/**
 * Every project file that (directly or transitively) imports `changedFileName`,
 * via breadth-first search over each file's direct resolved imports (see
 * getDirectResolvedImports/getCachedDirectResolvedImports).
 */
function findTransitiveDependants(
  typeScriptInstance: TypeScriptApiInstance,
  program: Program,
  changedFileName: string,
  projectFileNames: readonly string[],
  comparableSourceFileNames: ReadonlySet<string>,
): Set<string> {
  // `projectFileNames` is forward-slash-normalized; getCachedDirectResolvedImports
  // is OS-native, so both need normalizing before comparison - otherwise a
  // multi-hop dependant would never match on Windows past the first hop.
  const directImportsByFile = new Map(
    projectFileNames.map(candidateFileName => [
      candidateFileName,
      getCachedDirectResolvedImports(
        typeScriptInstance,
        program,
        candidateFileName,
        comparableSourceFileNames,
      ).map(toComparablePath),
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

const relativeSpecifierExtensions = [
  '',
  '.ts',
  '.tsx',
  '.d.ts',
  '.mts',
  '.d.mts',
  '.cts',
  '.d.cts',
  '.js',
  '.jsx',
];

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
 * TypeScript API's own (always forward-slash) source file names.
 */
function toComparablePath(fileName: string): string {
  return fileName.replace(/\\/g, '/');
}

/**
 * Emits declarations for every source file in the project matching the
 * given compiler options' allowJs setting, not just the file currently
 * being compiled - matching classic ts-loader's `provideDeclarationFilesToWebpack`.
 */
function recordProjectDeclarationFiles(
  instance: TSInstance,
  program: Program,
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
      instance.resolvedPathCache(projectFileName),
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
      instance.resolvedPathCache(fileName),
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

function filterDiagnosticsForReporting(
  instance: TSInstance,
  context: string,
  diagnostics: readonly Diagnostic[],
): Diagnostic[] {
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

function buildTypeScriptError(
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
    !hasFallbackFile && diagnostic.endPosition && diagnostic.end > diagnostic.pos
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

    const resolvedPath = instance.resolvedPathCache(resource);
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

function dedupeDiagnostics(diagnostics: readonly Diagnostic[]) {
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
