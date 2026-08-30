import * as crypto from 'crypto';
import * as path from 'path';
import type * as webpack from 'webpack';
import type {
  API,
  APIOptions,
  CompilerOptions,
  Diagnostic,
  EmitOutput,
  Program,
} from 'typescript/unstable/sync';

import * as constants from './constants';
import {
  buildTypeScriptError,
  dedupeDiagnostics,
  determineModulesByFile,
  filterDiagnosticsForReporting,
  reportTypeScriptErrors,
} from './diagnostics';
import type {
  FilePath,
  LoaderOptions,
  PendingDeclarationFile,
  TypeScriptInstance as TypeScriptApiInstance,
  TSInstance,
  ResolvedFilePathCache,
} from './types';
import { isWebpack5 } from './loaderUtils';

interface TypeScriptApiModule {
  API: new (options?: APIOptions) => API;
}

export function createTypeScriptApiInstance(
  loaderOptions: LoaderOptions,
  configFilePath: string,
  files: TSInstance['files'],
  resolvedFilePathCache: ResolvedFilePathCache,
): TypeScriptApiInstance {
  const typeScriptApiModule = loadTypeScriptApiModule(loaderOptions.compiler);

  // Served entirely via the `readFile` override below - never written to
  // real disk (see ensureSyntheticConfigForFile).
  const syntheticConfigContents = new Map<FilePath, string>();

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
          syntheticConfigContents.has(resolvedFilePathCache(fileName)) ||
          files.has(resolvedFilePathCache(fileName))
            ? true
            : undefined,
        // resolvedPathCache since the API may hand back a different path
        // spelling (or case, on a case-insensitive filesystem) than what
        // this was stored under.
        readFile: fileName =>
          syntheticConfigContents.get(resolvedFilePathCache(fileName)) ??
          files.get(resolvedFilePathCache(fileName))?.text,
      },
    }),
    configFilePath: resolvedFilePathCache(configFilePath),
    syntheticConfigContents,
    syntheticConfigFiles: new Map(),
    openedProjectPaths: new Set(),
    pendingInvalidation: true,
    directImportsCache: new Map(),
    projectDtsFileNamesCache: new Map(),
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
    instance.resolvedFilePathCache,
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
        configParseErrorMessage = reportConfigFileParsingErrors(
          instance,
          loaderContext,
          configFileParsingDiagnostics,
          typeScriptInstance.configFilePath,
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
        projectConfigPath,
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
      instance.pendingDiagnostics.set(
        instance.resolvedFilePathCache(fileName),
        {
          fileName,
          errors,
        },
      );

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
    return {
      outputText: undefined,
      sourceMapText: undefined,
      configParseErrorMessage: reportConfigFileParsingErrors(
        instance,
        loaderContext,
        configFileParsingDiagnostics,
        primaryProjectPath,
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
  const {
    outputText,
    sourceMapText,
    diagnostics = [],
  } = typeScriptInstance.api.transpileModule(contents, {
    compilerOptions,
    fileName: transpileFileName,
    reportDiagnostics: true,
  });

  // Classic ts-loader's transpileOnly path also surfaces whole-program
  // diagnostics (e.g. "rootDir must be explicitly set"); transpileModule
  // has no project of its own to derive these from, so pull them from the
  // resolved project directly.
  const programDiagnostics = dedupeDiagnostics(program.getProgramDiagnostics());

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
    primaryProjectPath,
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
 * Reports a broken tsconfig's diagnostics - a hard failure in classic
 * ts-loader too: there's nothing left to compile, so report the
 * diagnostic(s) then throw, which webpack surfaces as a "Module build
 * failed" error. Shared by getTypeScriptEmit and getTranspileOnlyEmit.
 */
function reportConfigFileParsingErrors(
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  configFileParsingDiagnostics: readonly Diagnostic[],
  projectPath: string,
): string {
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
      projectPath,
    ),
  );

  reportTypeScriptErrors(loaderContext, configErrors);

  return instance.colors.red('error while parsing tsconfig.json');
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
  const {
    outputText,
    sourceMapText,
    diagnostics = [],
  } = typeScriptInstance.api.transpileDeclaration(contents, {
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
  openProjects?: FilePath[],
  closeProjects?: FilePath[],
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
    // A real rescan can change any file's content or a project's file set,
    // so caches derived from the previous build can no longer be trusted -
    // see findTransitiveDependants/directImportsCache and
    // registerTypeScriptDependencies/projectDtsFileNamesCache.
    typeScriptInstance.directImportsCache.clear();
    typeScriptInstance.projectDtsFileNamesCache.clear();
  }
  typeScriptInstance.pendingInvalidation = false;
  const snapshot = typeScriptInstance.api.updateSnapshot(
    openProjects && openProjects.length > 0
      ? { openProjects, openFiles: [fileName], fileChanges, closeProjects }
      : { openFiles: [fileName], fileChanges, closeProjects },
  );

  typeScriptInstance.snapshot = snapshot;
  openProjects?.forEach(projectPath =>
    typeScriptInstance.openedProjectPaths.add(projectPath),
  );
  closeProjects?.forEach(projectPath =>
    typeScriptInstance.openedProjectPaths.delete(projectPath),
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
  resolvedFilePathCache: ResolvedFilePathCache,
  fileName: string,
  forceSyntheticRoot: boolean,
) {
  const { snapshot, primaryProjectPath, primaryProject } = openPrimaryProject(
    typeScriptInstance,
    fileName,
  );

  if (!forceSyntheticRoot && primaryProject?.program.getSourceFile(fileName)) {
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

  const { syntheticConfigPath, evictedProjectPath } =
    ensureSyntheticConfigForFile(
      typeScriptInstance,
      resolvedFilePathCache,
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
    evictedProjectPath ? [evictedProjectPath] : undefined,
  );

  return {
    snapshot: syntheticSnapshot,
    projectConfigPath: syntheticConfigPath,
  };
}

/**
 * Cap on distinct orphan-file synthetic projects (see below) tracked at
 * once. Each one holds its own ref-counted project open on the API side, so
 * leaving this unbounded would leak memory/state proportional to every
 * distinct orphan file (e.g. under `allowTsInNodeModules`) ever compiled
 * across a long watch session. Evicting the least-recently-used one past the
 * cap still lets a handful of actively-edited orphan files - the common
 * case - reuse their project across rebuilds.
 */
const maxOrphanFileProjects = 20;

function ensureSyntheticConfigForFile(
  typeScriptInstance: TypeScriptApiInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  configFilePath: FilePath,
  rootFiles: readonly string[],
  fileName: string,
): { syntheticConfigPath: FilePath; evictedProjectPath?: FilePath } {
  // Canonicalized before use as a cache key or hash input - two importers
  // spelling/casing the same orphan file differently would otherwise be
  // treated as distinct files, each getting (and holding open) its own
  // redundant synthetic project.
  const canonicalFileName = resolvedFilePathCache(fileName);
  const existing =
    typeScriptInstance.syntheticConfigFiles.get(canonicalFileName);
  if (existing) {
    // Bump to most-recently-used - a Map's iteration order is insertion
    // order, so deleting and re-setting moves this to the end.
    typeScriptInstance.syntheticConfigFiles.delete(canonicalFileName);
    typeScriptInstance.syntheticConfigFiles.set(canonicalFileName, existing);
    return { syntheticConfigPath: existing };
  }

  let evictedProjectPath: FilePath | undefined;
  if (typeScriptInstance.syntheticConfigFiles.size >= maxOrphanFileProjects) {
    const oldestEntry = typeScriptInstance.syntheticConfigFiles
      .entries()
      .next().value;
    if (oldestEntry) {
      const [evictedFileName, evictedSyntheticConfigPath] = oldestEntry;
      typeScriptInstance.syntheticConfigFiles.delete(evictedFileName);
      typeScriptInstance.syntheticConfigContents.delete(
        evictedSyntheticConfigPath,
      );
      evictedProjectPath = evictedSyntheticConfigPath;
    }
  }

  // A sibling of the real config, so its directory always already exists on
  // disk - see syntheticConfigContents in createTypeScriptApiInstance.
  const syntheticConfigPath = resolvedFilePathCache(
    path.join(
      path.dirname(configFilePath),
      `.${path.basename(configFilePath, '.json')}.ts-loader.${hashFileName(
        canonicalFileName,
      )}.json`,
    ),
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
  // `syntheticConfigFiles`/`syntheticConfigPath` are canonicalized (via
  // `resolvedPathCache`) opaque ids, used only for later `getProject`/
  // `openProjects` calls and as this same `readFile`/`fileExists`-serving
  // map's own key - not real on-disk paths.
  typeScriptInstance.syntheticConfigContents.set(
    syntheticConfigPath,
    configText,
  );
  typeScriptInstance.syntheticConfigFiles.set(
    canonicalFileName,
    syntheticConfigPath,
  );
  return { syntheticConfigPath, evictedProjectPath };
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

function getOutputAndSourceMapFromTypeScriptEmit(emitResult: EmitOutput) {
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
  projectConfigPath: string,
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
  for (const otherFileName of getProjectDtsFileNames(
    instance.typeScriptApiInstance,
    instance.resolvedFilePathCache,
    projectConfigPath,
    program,
  )) {
    if (otherFileName === apiFileName) {
      continue;
    }

    // `otherFileName` is forward-slash-normalized; webpack's addDependency
    // requires an OS-native absolute path or it rejects the dependency
    // outright on Windows.
    addDependency(path.normalize(otherFileName));
  }

  // transpileOnly never looks at another file's types, so a dependency's
  // content can't affect this file's transpiled output.
  if (!instance.loaderOptions.transpileOnly) {
    const comparableSourceFileNames = new Set(
      program.getSourceFileNames().map(toComparablePath),
    );
    registerResolvedImportDependencies(
      instance.typeScriptApiInstance,
      instance.resolvedFilePathCache,
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
 * Memoized list of a project's qualifying `.d.ts` file names - every
 * non-default-lib, non-external-library `.d.ts` in the program, matching
 * registerTypeScriptDependencies's own filter - reused across every file
 * compiled against the same project in the same build instead of rescanning
 * every file in the program on every single compile (see
 * `TypeScriptInstance.projectDtsFileNamesCache`).
 */
function getProjectDtsFileNames(
  typeScriptInstance: TypeScriptApiInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  projectConfigPath: string,
  program: Program,
): readonly string[] {
  const cachedFilePath = resolvedFilePathCache(projectConfigPath);
  const cachedProjectDtsFileNames =
    typeScriptInstance.projectDtsFileNamesCache.get(cachedFilePath);
  if (cachedProjectDtsFileNames) {
    return cachedProjectDtsFileNames;
  }

  const projectDtsFileNames: string[] = [];
  for (const otherFileName of program.getSourceFileNames()) {
    if (!constants.dtsDtsxOrDtsDtsxMapRegex.test(otherFileName)) {
      continue;
    }

    const sourceFile = program.getSourceFile(otherFileName);

    if (
      sourceFile &&
      !program.isSourceFileDefaultLibrary(sourceFile) &&
      !program.isSourceFileFromExternalLibrary(sourceFile)
    ) {
      projectDtsFileNames.push(otherFileName);
    }
  }

  typeScriptInstance.projectDtsFileNamesCache.set(
    cachedFilePath,
    projectDtsFileNames,
  );
  return projectDtsFileNames;
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
    instance.resolvedFilePathCache(dependencyFileName),
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
  resolvedFilePathCache: ResolvedFilePathCache,
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
  typeScriptInstance.directImportsCache.set(
    resolvedFilePathCache(fileName),
    resolvedImports,
  );

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
 *
 * Keyed via `resolvedPathCache` rather than `fileName` itself, since
 * `fileName` here is forward-slash-normalized (from `program.getSourceFileNames()`
 * - see findTransitiveDependants) while registerResolvedImportDependencies's
 * `fileName` is OS-native (from webpack) - without canonicalizing both to the
 * same key, a cache entry it writes could never be found here on Windows.
 */
function getCachedDirectResolvedImports(
  typeScriptInstance: TypeScriptApiInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  program: Program,
  fileName: string,
  comparableSourceFileNames: ReadonlySet<string>,
): readonly string[] {
  const cachedFilePath = resolvedFilePathCache(fileName);
  const cachedDirectResolvedImports =
    typeScriptInstance.directImportsCache.get(cachedFilePath);
  if (cachedDirectResolvedImports) {
    return cachedDirectResolvedImports;
  }

  const directResolvedImports = getDirectResolvedImports(
    program,
    fileName,
    comparableSourceFileNames,
  );
  typeScriptInstance.directImportsCache.set(
    cachedFilePath,
    directResolvedImports,
  );
  return directResolvedImports;
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
  const projectFileNames = program
    .getSourceFileNames()
    .filter(otherFileName => {
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
    instance.resolvedFilePathCache,
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

    const dependantModule = modulesByFile?.get(
      instance.resolvedFilePathCache(dependantFileName),
    )?.[0];

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
      instance.resolvedFilePathCache(dependantFileName),
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
  resolvedPathCache: ResolvedFilePathCache,
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
        resolvedPathCache,
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

      if (
        directImports.some(importedFileName => frontier.has(importedFileName))
      ) {
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
function recordProjectDeclarationFiles(instance: TSInstance, program: Program) {
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
      instance.resolvedFilePathCache(projectFileName),
      declarationFiles,
    );
  }
}
