import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type * as webpack from 'webpack';
import type {
  API,
  APIOptions,
  CompilerOptions,
  CreateSnapshotParams,
  Diagnostic,
  EmitOutput,
  ParsedCommandLine,
  Program,
  Snapshot,
  SyntheticProjectId,
} from 'typescript/sync';
import type { StringLiteralLikeNode } from 'typescript/ast';
import { createFileSystemLayer } from 'typescript/fs';

import * as constants from './constants';
import {
  buildTypeScriptError,
  dedupeDiagnostics,
  determineModulesByFile,
  filterDiagnosticsForReporting,
  reportTypeScriptErrors,
} from './diagnostics';
import type {
  ConfigOverrides,
  LoaderOptions,
  SyntheticProgram,
  TypeScriptInstance,
  TSInstance,
  ResolvedFilePathCache,
} from './types';
import { isWebpack5 } from './loaderUtils';

interface TypeScriptApiModule {
  API: new (options?: APIOptions) => API;
}

export function createTypeScriptInstance(
  loaderOptions: LoaderOptions,
  configFilePath: string,
  useCaseSensitiveFileNames: boolean,
): TypeScriptInstance {
  const typeScriptApiModule = loadTypeScriptApiModule(loaderOptions.compiler);
  // No `fs` callbacks: the API reads disk directly, with webpack's content
  // layered on top per file (see layerFileContents). Case sensitivity is
  // passed explicitly so the API agrees with `resolvedFilePathCache`.
  const api = new typeScriptApiModule.API({ useCaseSensitiveFileNames });

  return {
    api,
    configFilePath: path.resolve(configFilePath),
    configOverrides: getConfigOverrides(loaderOptions),
    useCaseSensitiveFileNames,
    transpileConfig: undefined,
    orphanRootFileNames: new Map(),
    primaryProjectOpened: false,
    pendingInvalidation: true,
    directImportsCache: new Map(),
    projectFileNamesCache: new Map(),
    changedFilesThisBuild: new Set(),
    watcherChangedFiles: undefined,
  };
}

function getConfigOverrides(
  loaderOptions: LoaderOptions,
): ConfigOverrides | undefined {
  const compilerOptions = loaderOptions.compilerOptions ?? {};
  return loaderOptions.context === undefined &&
    Object.keys(compilerOptions).length === 0
    ? undefined
    : { compilerOptions, context: loaderOptions.context };
}

/**
 * The project's config with the `compilerOptions` loader option merged over
 * tsconfig.json's own, and relative paths resolved against `context`.
 */
function parseConfigWithOverrides(
  typeScriptInstance: TypeScriptInstance,
  { compilerOptions, context }: ConfigOverrides,
): ParsedCommandLine {
  const { api, configFilePath } = typeScriptInstance;
  const { config, error } = api.readConfigFile(configFilePath);
  const rawConfig = (config ?? {}) as {
    compilerOptions?: Record<string, unknown>;
  };
  const parsedConfig = api.parseJsonConfigFileContent(
    {
      ...rawConfig,
      compilerOptions: { ...rawConfig.compilerOptions, ...compilerOptions },
    },
    // `configDirectory` also moves where a relative `extends` is resolved
    // from, so it's only used when `context` really is another directory.
    context === undefined ||
      path.normalize(context) === path.dirname(configFilePath)
      ? { configFileName: configFilePath }
      : { configDirectory: context },
  );
  return {
    ...parsedConfig,
    options: removeOrphanedSourceMapOptions(
      parsedConfig.options,
      compilerOptions,
    ),
    ...(error ? { errors: [error] } : {}),
  };
}

/**
 * tsconfig.json options that need a source map option the `compilerOptions`
 * loader option has turned off (TS5051, TS5069) are dropped with it, so one
 * override is enough. Options the override didn't orphan are left to error.
 */
function removeOrphanedSourceMapOptions(
  options: CompilerOptions,
  overrides: Record<string, unknown>,
): CompilerOptions {
  const turnedOff = (
    option: 'sourceMap' | 'inlineSourceMap' | 'declarationMap',
  ) => option in overrides && !options[option];
  if (
    !turnedOff('sourceMap') &&
    !turnedOff('inlineSourceMap') &&
    !turnedOff('declarationMap')
  ) {
    return options;
  }
  const { inlineSources, sourceRoot, mapRoot, ...otherOptions } = options;
  const keep = (option: 'inlineSources' | 'sourceRoot' | 'mapRoot') =>
    option in overrides;
  return {
    ...otherOptions,
    ...(options.sourceMap || options.inlineSourceMap || keep('inlineSources')
      ? { inlineSources }
      : {}),
    ...(options.sourceMap || options.inlineSourceMap || keep('sourceRoot')
      ? { sourceRoot }
      : {}),
    ...(options.sourceMap || options.declarationMap || keep('mapRoot')
      ? { mapRoot }
      : {}),
  };
}

/** `undefined` unless `compilerOptions` or `context` is set. */
function getOverriddenConfig(
  typeScriptInstance: TypeScriptInstance,
): ParsedCommandLine | undefined {
  if (typeScriptInstance.configOverrides === undefined) {
    return undefined;
  }
  typeScriptInstance.overriddenConfig ??= parseConfigWithOverrides(
    typeScriptInstance,
    typeScriptInstance.configOverrides,
  );
  return typeScriptInstance.overriddenConfig;
}

/**
 * A dead `tsgo` process fails every later call, so this replaces it with a
 * new one, which starts with a full rescan. Returns whether it did.
 */
export function restartTypeScriptApiIfDead(instance: TSInstance): boolean {
  const previous = instance.typeScriptApiInstance;
  try {
    // Needs no project or file, so it only throws if the process is gone.
    previous.api.transpileModule('', {});
    return false;
  } catch {
    // dead
  }
  try {
    previous.api.close();
  } catch {
    // close() throws too once the process is gone
  }
  instance.typeScriptApiInstance = {
    ...createTypeScriptInstance(
      instance.loaderOptions,
      previous.configFilePath,
      previous.useCaseSensitiveFileNames,
    ),
    // Their dependants still need the end-of-build recheck.
    changedFilesThisBuild: previous.changedFilesThisBuild,
  };
  return true;
}

export function getTypeScriptEmit(
  fileName: string,
  contents: string,
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
) {
  // `apiFileName` for API calls; `fileName` for anything shown to webpack/the user.
  const apiFileName = toApiFacingFileName(fileName);

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
  // `allowTsInNodeModules` opts in via the synthetic program fallback below,
  // which does list it as a root.
  const forceSyntheticRoot =
    instance.loaderOptions.allowTsInNodeModules &&
    fileName.indexOf('node_modules') !== -1;
  const overriddenConfig = getOverriddenConfig(typeScriptInstance);
  if (overriddenConfig !== undefined && overriddenConfig.errors.length > 0) {
    // See the config-parsing check below.
    return {
      outputText: undefined,
      sourceMapText: undefined,
      configParseErrorMessage: reportConfigFileParsingErrors(
        instance,
        loaderContext,
        overriddenConfig.errors,
        typeScriptInstance.configFilePath,
      ),
    };
  }
  const { snapshot, syntheticProgramId } = prepareSnapshotForFile(
    typeScriptInstance,
    instance.resolvedFilePathCache,
    apiFileName,
    contents,
    forceSyntheticRoot,
    overriddenConfig,
  );
  // Keys the per-project caches - see getProjectFileNames.
  const projectKey = syntheticProgramId ?? typeScriptInstance.configFilePath;

  // Prefer the project ts-loader explicitly resolved over the API's own
  // nearest-tsconfig auto-discovery, which can pick an unrelated
  // tsconfig.json that happens to sit closer to `fileName` on disk.
  const configuredProject = syntheticProgramId
    ? snapshot.getProject(syntheticProgramId)
    : snapshot.getConfiguredProject(typeScriptInstance.configFilePath);
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
      : (snapshot.getDefaultProjectForFile(apiFileName) ?? configuredProject);

  if (!project) {
    throw new Error(`TypeScript could not resolve a project for ${fileName}.`);
  }

  const program = project.program;

  const configFileParsingDiagnostics =
    program.getConfigFileParsingDiagnostics();
  if (configFileParsingDiagnostics.length > 0) {
    // Returned rather than thrown so index.ts's `loader` can create the
    // Error in its own frame, matching classic ts-loader's stack trace.
    return {
      outputText: undefined,
      sourceMapText: undefined,
      configParseErrorMessage: reportConfigFileParsingErrors(
        instance,
        loaderContext,
        configFileParsingDiagnostics,
        typeScriptInstance.configFilePath,
      ),
    };
  }

  const emitResult = program.getJavaScriptEmit([apiFileName]);
  const perFileDiagnostics = dedupeDiagnostics([
    ...program.getSyntacticDiagnostics(apiFileName),
    ...emitResult.diagnostics,
    ...program.getSemanticDiagnostics(apiFileName),
  ]);

  const { outputText, sourceMapText } =
    getOutputAndSourceMapFromTypeScriptEmit(emitResult);

  // A synthetic program has no config files of its own - it's built from
  // the primary project's, which are what can invalidate it.
  const configFileNames = (
    syntheticProgramId
      ? (snapshot.getConfiguredProject(typeScriptInstance.configFilePath)
          ?.program ?? program)
      : program
  ).getConfigFileNames();
  typeScriptInstance.configFileNames = configFileNames;
  registerTypeScriptDependencies(
    loaderContext,
    program,
    fileName,
    apiFileName,
    projectKey,
    configFileNames,
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

  // Reported at end of build (reportPendingTypeScriptDiagnostics), once we
  // can tell whether webpack already recorded its own error for the module.
  instance.pendingDiagnostics.set(instance.resolvedFilePathCache(fileName), {
    fileName,
    errors,
  });

  // Its dependants are rechecked once per build by recheckAllTransitiveDependants.
  typeScriptInstance.changedFilesThisBuild.add(apiFileName);

  return { outputText, sourceMapText, configParseErrorMessage: undefined };
}

/**
 * transpileOnly's emit path: `api.transpileModule` (plus
 * `api.transpileDeclaration` for `isolatedDeclarations`) - program-less
 * single-file transforms that need only the project's compiler options.
 */
function getTranspileOnlyEmit(
  fileName: string,
  apiFileName: string,
  contents: string,
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
) {
  const typeScriptInstance = instance.typeScriptApiInstance;
  const config = getTranspileConfig(typeScriptInstance);
  const configFileParsingDiagnostics = config.errors;

  if (configFileParsingDiagnostics.length > 0) {
    // See the equivalent check in getTypeScriptEmit.
    return {
      outputText: undefined,
      sourceMapText: undefined,
      configParseErrorMessage: reportConfigFileParsingErrors(
        instance,
        loaderContext,
        configFileParsingDiagnostics,
        typeScriptInstance.configFilePath,
      ),
    };
  }

  // transpileModule/transpileDeclaration use `fileName` verbatim in their own
  // virtual filesystem; an OS-native path panics there on Windows ("mixed
  // posix and windows paths").
  const transpileFileName = toForwardSlashPath(apiFileName);

  const compilerOptions = config.options;
  const {
    outputText,
    sourceMapText,
    diagnostics = [],
  } = typeScriptInstance.api.transpileModule(contents, {
    compilerOptions,
    fileName: transpileFileName,
    reportDiagnostics: true,
  });

  // transpileModule repeats the project's option errors for every file;
  // they're reported once per build, by recordProgramDiagnostics.
  const configDiagnostics = typeScriptInstance.transpileConfigDiagnostics ?? [];
  const errors = filterDiagnosticsForReporting(
    instance,
    loaderContext.context,
    dedupeDiagnostics(diagnostics).filter(
      diagnostic =>
        diagnostic.fileName !== undefined ||
        !configDiagnostics.some(
          configDiagnostic =>
            configDiagnostic.code === diagnostic.code &&
            configDiagnostic.text === diagnostic.text,
        ),
    ),
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

  // No type-check to wait for, so report immediately, matching classic.
  reportTypeScriptErrors(loaderContext, errors);

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

function getTranspileConfig(
  typeScriptInstance: TypeScriptInstance,
): ParsedCommandLine {
  if (
    typeScriptInstance.transpileConfig === undefined ||
    typeScriptInstance.pendingInvalidation ||
    typeScriptInstance.pendingChangedFiles !== undefined ||
    typeScriptInstance.pendingRemovedFiles !== undefined
  ) {
    typeScriptInstance.transpileConfig =
      typeScriptInstance.configOverrides === undefined
        ? typeScriptInstance.api.parseConfigFile(
            typeScriptInstance.configFilePath,
          )
        : parseConfigWithOverrides(
            typeScriptInstance,
            typeScriptInstance.configOverrides,
          );
    const config = typeScriptInstance.transpileConfig;
    if (config.errors.length === 0) {
      // Match classic transpileOnly's empty program unless root files are
      // required for emit-path diagnostics such as TS5055 and TS6059.
      const rootFiles = requiresRootFileDiagnostics(config)
        ? config.fileNames
        : [];
      const compilerOptions =
        rootFiles.length === 0
          ? config.options
          : { ...config.options, noCheck: true, noResolve: true };
      const program = typeScriptInstance.api.createProgram(
        rootFiles,
        compilerOptions,
        { configFileParsingDiagnostics: config.errors },
      );
      typeScriptInstance.transpileConfigDiagnostics =
        program.getProgramDiagnostics();
      program.dispose();
    } else {
      typeScriptInstance.transpileConfigDiagnostics = [];
    }
    typeScriptInstance.pendingInvalidation = false;
    typeScriptInstance.pendingChangedFiles = undefined;
    typeScriptInstance.pendingRemovedFiles = undefined;
  }
  return typeScriptInstance.transpileConfig;
}

function requiresRootFileDiagnostics(config: ParsedCommandLine): boolean {
  if (config.options.allowJs) {
    return true;
  }
  if (!config.options.rootDir) {
    return false;
  }
  const rootDir = path.resolve(config.options.rootDir);
  return config.fileNames.some(fileName => {
    const relativePath = path.relative(rootDir, fileName);
    return (
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    );
  });
}

/**
 * Reports a broken tsconfig's diagnostics and returns the message for the
 * "Module build failed" error the caller raises - a hard failure, as in
 * classic ts-loader.
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
 * transpileDeclaration returns raw text, not a named output file, so the
 * output path is computed here, and the file is emitted directly.
 */
function recordTranspileOnlyDeclarationFile(
  instance: TSInstance,
  typeScriptInstance: TypeScriptInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  fileName: string,
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
  const specifier = `${compilerPackage}/sync`;

  try {
    return require(specifier) as TypeScriptApiModule;
  } catch (error) {
    throw new Error(
      `Could not load the TypeScript API from "${specifier}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

type SnapshotChanges = Pick<
  CreateSnapshotParams,
  | 'openProjects'
  | 'createPrograms'
  | 'reconfigurePrograms'
  | 'removePrograms'
  | 'fileSystem'
  | 'ensurePrograms'
>;

function updateSnapshot(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  fileName: string,
  changes?: SnapshotChanges,
  // Only from recheckAllTransitiveDependants: files compiled this build,
  // for the API to re-read.
  changedFileNames?: ReadonlySet<string>,
) {
  const previousSnapshot = typeScriptInstance.snapshot;
  // Which files the API should re-read, most conservative first:
  // 1. `pendingInvalidation` - nothing known (first build, webpack 4): rescan all.
  // 2. `pendingChangedFiles`/`pendingRemovedFiles` - webpack 5's watcher list.
  // 3. `changedFileNames`.
  // At most one applies: 1 and 2 are consumed by the first call of a build.
  const pendingChangedOrRemovedFiles =
    typeScriptInstance.pendingChangedFiles ??
    typeScriptInstance.pendingRemovedFiles;
  const createdFiles = findCreatedFiles(
    typeScriptInstance,
    resolvedFilePathCache,
  );
  const fileNotifications = typeScriptInstance.pendingInvalidation
    ? ({ invalidateAll: true } as const)
    : pendingChangedOrRemovedFiles
      ? {
          changed: [
            ...(mapApiFacingFileNames(
              typeScriptInstance.pendingChangedFiles &&
                new Set(
                  [...typeScriptInstance.pendingChangedFiles].filter(
                    fileName => !createdFiles.has(fileName),
                  ),
                ),
            ) ?? []),
            // The config files are build dependencies, which webpack's
            // watcher doesn't report, so the API would never re-read them.
            // Naming an unchanged file costs nothing measurable.
            // `configFileNames` is unset until a build gets past parsing the
            // config, so the root config is always named too.
            ...new Set(
              [
                typeScriptInstance.configFilePath,
                ...(typeScriptInstance.configFileNames ?? []),
              ].map(fileName => path.resolve(fileName)),
            ),
          ],
          created: mapApiFacingFileNames(createdFiles),
          deleted: mapApiFacingFileNames(
            typeScriptInstance.pendingRemovedFiles,
          ),
        }
      : changedFileNames && changedFileNames.size > 0
        ? {
            changed: [...changedFileNames].map(fileName =>
              path.resolve(fileName),
            ),
          }
        : undefined;
  // directImportsCache: a full rescan could change any file, and a created
  // file can satisfy imports that previously failed to resolve, so clear it
  // all. Otherwise only the listed files' own entries can be stale (for
  // `changedFileNames` they were already rewritten by their own compile -
  // see registerResolvedImportDependencies). projectFileNamesCache
  // self-validates, so it's never cleared.
  if (typeScriptInstance.pendingInvalidation || createdFiles.size > 0) {
    typeScriptInstance.directImportsCache.clear();
  } else if (pendingChangedOrRemovedFiles) {
    for (const rawFileName of [
      ...(typeScriptInstance.pendingChangedFiles ?? []),
      ...(typeScriptInstance.pendingRemovedFiles ?? []),
    ]) {
      typeScriptInstance.directImportsCache.delete(
        resolvedFilePathCache(toApiFacingFileName(rawFileName)),
      );
    }
  }
  typeScriptInstance.pendingInvalidation = false;
  typeScriptInstance.pendingChangedFiles = undefined;
  typeScriptInstance.pendingRemovedFiles = undefined;
  // Real casing, not resolvedFilePathCache's canonical form: a casing
  // mismatch with `openProjects` (e.g. a lowercased drive letter) stops the
  // API finding the file's project on Windows - see
  // https://github.com/microsoft/TypeScript/pull/64204#issuecomment-5791438694.
  // The API also echoes this casing back into diagnostics.
  const apiFacingFileName = path.resolve(fileName);
  const params: CreateSnapshotParams = {
    ...changes,
    openFiles: [apiFacingFileName],
    fileNotifications,
  };
  // The API keeps no "latest snapshot" of its own, so each one must be built
  // via `update` on the previous to keep its cache
  // (https://github.com/microsoft/TypeScript/pull/64204).
  const snapshot = previousSnapshot
    ? previousSnapshot.update(params)
    : typeScriptInstance.api.createSnapshot(params);

  typeScriptInstance.snapshot = snapshot;
  previousSnapshot?.dispose?.();

  return snapshot;
}

/**
 * The TypeScript/JavaScript files that the primary program didn't contain
 * when its file list was last read (see getProjectFileNames):
 * - files in `pendingChangedFiles` - created, or restored after a deletion,
 *   rather than edited, since webpack's watcher reports both as modified.
 * - files the config now includes. Nothing watches a file that webpack
 *   doesn't bundle until it's in the program, so the watcher can't report
 *   its creation, and the API only adds it to the project when told.
 */
function findCreatedFiles(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
): ReadonlySet<string> {
  const changedFiles = typeScriptInstance.pendingChangedFiles;
  // The orphan program contains the whole primary project too.
  const lastKnownFileNames = typeScriptInstance.projectFileNamesCache.get(
    resolvedFilePathCache(
      typeScriptInstance.orphanProgram?.id ?? typeScriptInstance.configFilePath,
    ),
  )?.sourceFileNames;
  if (!changedFiles || !lastKnownFileNames) {
    return new Set();
  }
  const knownFileNames = new Set(
    lastKnownFileNames.map(fileName =>
      toComparablePath(resolvedFilePathCache, fileName),
    ),
  );
  const configFileNames = (
    getOverriddenConfig(typeScriptInstance) ??
    typeScriptInstance.api.parseConfigFile(typeScriptInstance.configFilePath)
  ).fileNames;
  return new Set(
    [...changedFiles, ...configFileNames].filter(
      fileName =>
        constants.tsTsxJsJsxRegex.test(fileName) &&
        !knownFileNames.has(
          toComparablePath(
            resolvedFilePathCache,
            toApiFacingFileName(fileName),
          ),
        ),
    ),
  );
}

/** `undefined` for an empty set, so the field is omitted from the request. */
function mapApiFacingFileNames(
  fileNames: ReadonlySet<string> | undefined,
): string[] | undefined {
  if (!fileNames || fileNames.size === 0) {
    return undefined;
  }
  return [...fileNames].map(fileName =>
    path.resolve(toApiFacingFileName(fileName)),
  );
}

/** Opens (or reuses) the project for `configFilePath`. */
function openPrimaryProject(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  fileName: string,
  changedFileNames?: ReadonlySet<string>,
  changes?: SnapshotChanges,
) {
  const primaryProjectPath = typeScriptInstance.configFilePath;
  const snapshot = updateSnapshot(
    typeScriptInstance,
    resolvedFilePathCache,
    fileName,
    typeScriptInstance.primaryProjectOpened
      ? changes
      : { ...changes, openProjects: [primaryProjectPath] },
    changedFileNames,
  );
  typeScriptInstance.primaryProjectOpened = true;

  return {
    snapshot,
    primaryProjectPath,
    primaryProject: snapshot.getConfiguredProject(primaryProjectPath),
  };
}

/**
 * Layers `contents` - what webpack handed the loader, which can differ from
 * disk (another loader ran first) or not exist there at all (a `.vue.ts`
 * alias) - over the snapshot, so every later snapshot and program sees it.
 *
 * The primary project is refreshed only on the first call of a build (see
 * https://github.com/microsoft/TypeScript/issues/63875#issuecomment-5513828692).
 * That refresh carries the layer in the same request because opening a
 * layer-only file fails if the layer arrives later.
 */
function layerFileContents(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  fileName: string,
  contents: string,
): Snapshot {
  const fileLayer: SnapshotChanges = {
    fileSystem: createFileSystemLayer([[fileName, contents]]),
    ensurePrograms: true,
  };
  if (
    typeScriptInstance.snapshot === undefined ||
    typeScriptInstance.pendingInvalidation ||
    typeScriptInstance.pendingChangedFiles !== undefined ||
    typeScriptInstance.pendingRemovedFiles !== undefined
  ) {
    return openPrimaryProject(
      typeScriptInstance,
      resolvedFilePathCache,
      fileName,
      undefined,
      fileLayer,
    ).snapshot;
  }
  const previousSnapshot = typeScriptInstance.snapshot;
  const snapshot = previousSnapshot.update(fileLayer);
  typeScriptInstance.snapshot = snapshot;
  previousSnapshot.dispose();
  return snapshot;
}

function prepareSnapshotForFile(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  fileName: string,
  contents: string,
  forceSyntheticRoot: boolean,
  overriddenConfig: ParsedCommandLine | undefined,
): { snapshot: Snapshot; syntheticProgramId?: SyntheticProjectId } {
  // Layered first: a layered file appears in directory listings, so it can
  // change what the project's `include` globs match.
  const snapshot = layerFileContents(
    typeScriptInstance,
    resolvedFilePathCache,
    fileName,
    contents,
  );
  if (overriddenConfig !== undefined) {
    return ensureOrphanProgram(
      typeScriptInstance,
      resolvedFilePathCache,
      overriddenConfig,
      fileName,
      forceSyntheticRoot,
    );
  }

  const primaryProjectPath = typeScriptInstance.configFilePath;
  const primaryProject = snapshot.getConfiguredProject(primaryProjectPath);

  if (!forceSyntheticRoot && primaryProject?.program.getSourceFile(fileName)) {
    return { snapshot };
  }

  // A broken tsconfig must surface; a synthetic program would hide it.
  if (
    primaryProject &&
    primaryProject.program.getConfigFileParsingDiagnostics().length > 0
  ) {
    return { snapshot };
  }

  return ensureOrphanProgram(
    typeScriptInstance,
    resolvedFilePathCache,
    primaryProject?.parsedCommandLine ??
      typeScriptInstance.api.parseConfigFile(primaryProjectPath),
    fileName,
    forceSyntheticRoot,
  );
}

/**
 * The one synthetic program shared by every "orphan" file the primary
 * project doesn't include - like classic ts-loader's single program, whose
 * roots were the tsconfig's files plus every file webpack handed it. Roots:
 * the primary project's roots, plus each orphan the program doesn't already
 * contain via an import (or always, under `forceRoot` - the API skips emit
 * for a node_modules file that isn't a root). As a superset of the primary
 * project it's also the full import graph for recheckAllTransitiveDependants.
 */
function ensureOrphanProgram(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  primaryConfig: ParsedCommandLine,
  fileName: string,
  forceRoot: boolean,
): { snapshot: Snapshot; syntheticProgramId: SyntheticProjectId } {
  const { orphanProgram, orphanRootFileNames } = typeScriptInstance;
  const canonicalFileName = resolvedFilePathCache(fileName);
  if (
    orphanProgram &&
    (forceRoot
      ? orphanRootFileNames.has(canonicalFileName)
      : typeScriptInstance
          .snapshot!.getProject(orphanProgram.id)
          ?.program.getSourceFile(fileName))
  ) {
    return reconfigureOrphanProgramIfStale(
      typeScriptInstance,
      resolvedFilePathCache,
      primaryConfig,
      fileName,
      orphanProgram,
    );
  }

  // With config overrides this program holds every file, so the config's own
  // roots arrive here too; they're roots already.
  const comparableFileName = toComparablePath(resolvedFilePathCache, fileName);
  if (
    forceRoot ||
    !primaryConfig.fileNames.some(
      rootFileName =>
        toComparablePath(resolvedFilePathCache, rootFileName) ===
        comparableFileName,
    )
  ) {
    orphanRootFileNames.set(canonicalFileName, fileName);
  }
  const program = orphanProgramParams(typeScriptInstance, primaryConfig);
  const configuration = JSON.stringify(program);
  if (orphanProgram) {
    orphanProgram.configuration = configuration;
    return {
      snapshot: updateSnapshot(
        typeScriptInstance,
        resolvedFilePathCache,
        fileName,
        { reconfigurePrograms: [{ id: orphanProgram.id, ...program }] },
      ),
      syntheticProgramId: orphanProgram.id,
    };
  }

  const snapshot = updateSnapshot(
    typeScriptInstance,
    resolvedFilePathCache,
    fileName,
    { createPrograms: [program] },
  );
  const syntheticProgramId = snapshot.operation.createdPrograms![0].id;
  typeScriptInstance.orphanProgram = { id: syntheticProgramId, configuration };
  return { snapshot, syntheticProgramId };
}

/**
 * Keeps the orphan program's options and the primary project's share of its
 * roots in step with the primary project's own (e.g. after a full rescan).
 */
function reconfigureOrphanProgramIfStale(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  primaryConfig: ParsedCommandLine,
  fileName: string,
  orphanProgram: SyntheticProgram,
): { snapshot: Snapshot; syntheticProgramId: SyntheticProjectId } {
  const program = orphanProgramParams(typeScriptInstance, primaryConfig);
  const configuration = JSON.stringify(program);
  if (orphanProgram.configuration === configuration) {
    return {
      snapshot: typeScriptInstance.snapshot!,
      syntheticProgramId: orphanProgram.id,
    };
  }
  orphanProgram.configuration = configuration;
  return {
    snapshot: updateSnapshot(
      typeScriptInstance,
      resolvedFilePathCache,
      fileName,
      { reconfigurePrograms: [{ id: orphanProgram.id, ...program }] },
    ),
    syntheticProgramId: orphanProgram.id,
  };
}

function orphanProgramParams(
  typeScriptInstance: TypeScriptInstance,
  primaryConfig: ParsedCommandLine,
) {
  return {
    rootFiles: [
      ...new Set([
        ...primaryConfig.fileNames,
        ...typeScriptInstance.orphanRootFileNames.values(),
      ]),
    ].sort(),
    compilerOptions: primaryConfig.options,
    options: { projectReferences: primaryConfig.projectReferences },
  };
}

/**
 * The name used for API calls. The API rejects a file with an unrecognized
 * extension (e.g. a Vue SFC's `<script>` block) since it can't infer a
 * ScriptKind, and offers no way to set one - unlike classic ts-loader's
 * LanguageService, which defaulted to TS. So such files get a virtual `.ts`
 * suffix (appended, so relative imports still resolve from the real
 * directory) and are layered under that name - see layerFileContents.
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
  projectKey: string,
  configFileNames: readonly string[],
  instance: TSInstance,
) {
  loaderContext.clearDependencies();
  loaderContext.addDependency(fileName);

  // Tracked so their versions can go into buildMeta below.
  const dependencies: string[] = [];
  const addDependency = (dependencyFileName: string) => {
    loaderContext.addDependency(dependencyFileName);
    dependencies.push(dependencyFileName);
  };

  // Every .d.ts can affect type-checking without being in webpack's module
  // graph. Source files are limited to this file's own imports, or every
  // file would depend on every other.
  for (const otherFileName of getProjectDtsFileNames(
    instance.typeScriptApiInstance,
    instance.resolvedFilePathCache,
    projectKey,
    program,
  )) {
    if (otherFileName === apiFileName) {
      continue;
    }

    // API names are forward-slashed; webpack's addDependency rejects
    // non-native absolute paths on Windows.
    addDependency(path.normalize(otherFileName));
  }

  // transpileOnly never looks at another file's types, so a dependency's
  // content can't affect this file's transpiled output.
  if (!instance.loaderOptions.transpileOnly) {
    const comparableSourceFileNames = new Set(
      program
        .getSourceFileNames()
        .map(fileName =>
          toComparablePath(instance.resolvedFilePathCache, fileName),
        ),
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

  // Forward-slashed too - same Windows requirement as above.
  for (const configFileName of configFileNames) {
    const normalizedConfigFileName = path.normalize(configFileName);
    if (isWebpack5) {
      loaderContext.addBuildDependency(normalizedConfigFileName);
    } else {
      loaderContext.addDependency(normalizedConfigFileName);
    }
  }

  // A dependency can change this file's diagnostics without changing its
  // JS; without this, webpack could reuse a cached result with stale
  // diagnostics. Same buildMeta key as classic ts-loader.
  if (loaderContext._module?.buildMeta !== undefined) {
    loaderContext._module.buildMeta.tsLoaderDefinitionFileVersions =
      dependencies.map(dependencyFileName =>
        getDependencyVersionTag(instance, program, dependencyFileName),
      );
  }
}

/**
 * A project's source file names, excluding default-lib and external-library
 * files. Classifying a file costs two API round trips, so the result is
 * cached per project. `getSourceFileNames()` is a single round trip, so it's
 * fetched every time and compared against the list the cached result came
 * from: content-only edits leave it unchanged (cache hit), adding/removing a
 * file changes it (reclassify). That self-check means the cache never needs
 * invalidating, unlike `directImportsCache`.
 */
function getProjectFileNames(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  projectKey: string,
  program: Program,
): readonly string[] {
  const cachedFilePath = resolvedFilePathCache(projectKey);
  const sourceFileNames = program.getSourceFileNames();
  const cached = typeScriptInstance.projectFileNamesCache.get(cachedFilePath);
  if (cached && sameFileNames(cached.sourceFileNames, sourceFileNames)) {
    return cached.result;
  }

  const result = sourceFileNames.filter(otherFileName => {
    const sourceFile = program.getSourceFile(otherFileName);
    return (
      sourceFile &&
      !program.isSourceFileDefaultLibrary(sourceFile) &&
      !program.isSourceFileFromExternalLibrary(sourceFile)
    );
  });

  typeScriptInstance.projectFileNamesCache.set(cachedFilePath, {
    sourceFileNames,
    result,
  });
  return result;
}

/** Order-insensitive. */
function sameFileNames(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const bSet = new Set(b);
  return a.every(name => bSet.has(name));
}

function getProjectDtsFileNames(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  projectKey: string,
  program: Program,
): readonly string[] {
  return getProjectFileNames(
    typeScriptInstance,
    resolvedFilePathCache,
    projectKey,
    program,
  ).filter(otherFileName =>
    constants.dtsDtsxOrDtsDtsxMapRegex.test(otherFileName),
  );
}

/**
 * `"<file>@<version>"`. Files that never went through the loader (e.g. an
 * ambient .d.ts) have no tracked version, so their content is hashed instead.
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
 * Makes `fileName` depend on the project files it imports. A type-only
 * import is erased before webpack sees it, so this is the only thing that
 * rebuilds `fileName` when such a file changes.
 *
 * Always computed fresh, since `fileName` may have just been edited, and
 * written back to `directImportsCache` for findTransitiveDependants.
 */
function registerResolvedImportDependencies(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  program: Program,
  fileName: string,
  comparableSourceFileNames: ReadonlySet<string>,
  addDependency: (dependencyFileName: string) => void,
) {
  const [resolvedImports] = getDirectResolvedImports(
    typeScriptInstance,
    resolvedFilePathCache,
    program,
    [fileName],
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
 * `getDirectResolvedImports` through `directImportsCache`, with all uncached
 * files resolved in one batch. Keys go through `resolvedFilePathCache`
 * because names here are forward-slashed (from the API) while
 * registerResolvedImportDependencies writes OS-native ones (from webpack);
 * without that, its entries would never be found on Windows.
 */
function getCachedDirectResolvedImports(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  program: Program,
  fileNames: readonly string[],
  comparableSourceFileNames: ReadonlySet<string>,
): (readonly string[])[] {
  const { directImportsCache } = typeScriptInstance;
  const uncachedFileNames = fileNames.filter(
    fileName => !directImportsCache.has(resolvedFilePathCache(fileName)),
  );
  if (uncachedFileNames.length > 0) {
    const resolvedImports = getDirectResolvedImports(
      typeScriptInstance,
      resolvedFilePathCache,
      program,
      uncachedFileNames,
      comparableSourceFileNames,
    );
    uncachedFileNames.forEach((fileName, index) =>
      directImportsCache.set(
        resolvedFilePathCache(fileName),
        resolvedImports[index],
      ),
    );
  }
  return fileNames.map(fileName =>
    directImportsCache.get(resolvedFilePathCache(fileName))!,
  );
}

/**
 * The other project files each of `fileNames` imports (OS-native names), as
 * resolved by the program - so `paths`, `baseUrl`, package `exports` etc.
 * count. Unresolved imports and ones outside the project (e.g.
 * node_modules) are left out (see the aliasResolution test).
 * `comparableSourceFileNames` is passed in because building it is O(n) and
 * it's the same for every file in a pass. All requests go in one batch.
 */
function getDirectResolvedImports(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  program: Program,
  fileNames: readonly string[],
  comparableSourceFileNames: ReadonlySet<string>,
): string[][] {
  const { api } = typeScriptInstance;
  const sourceFiles = api.batch(
    ...fileNames.map(fileName => program.getSourceFile.gen(fileName)),
  );

  const importingFileIndexes: number[] = [];
  const resolutionRequests = sourceFiles.flatMap((sourceFile, index) =>
    (sourceFile?.imports ?? []).map(specifierNode => {
      importingFileIndexes.push(index);
      return program.getResolvedModuleFromModuleSpecifier.gen(
        specifierNode as StringLiteralLikeNode,
        fileNames[index],
      );
    }),
  );
  const resolvedModules =
    resolutionRequests.length > 0 ? api.batch(...resolutionRequests) : [];

  const resolvedImports = fileNames.map((): string[] => []);
  resolvedModules.forEach((resolvedModule, requestIndex) => {
    if (!resolvedModule || resolvedModule.isExternalLibraryImport) {
      return;
    }
    const fileIndex = importingFileIndexes[requestIndex];
    const comparableResolvedFileName = toComparablePath(
      resolvedFilePathCache,
      resolvedModule.resolvedFileName,
    );
    if (
      comparableSourceFileNames.has(comparableResolvedFileName) &&
      comparableResolvedFileName !==
        toComparablePath(resolvedFilePathCache, fileNames[fileIndex])
    ) {
      resolvedImports[fileIndex].push(
        path.normalize(resolvedModule.resolvedFileName),
      );
    }
  });
  return resolvedImports;
}

/**
 * The end-of-build type-check pass, matching classic ts-loader's afterCompile
 * re-check. Recomputes and stores fresh diagnostics for:
 *
 * - every project file that (directly or transitively) imports any file
 *   changed in the current build (see `changedFilesThisBuild` and
 *   `watcherChangedFiles`), so a dependant's type-check is reported even when
 *   webpack has no reason to rebuild its own module - e.g. a `mid` file that
 *   only imports a `leaf` gets no webpack-level rebuild when a `hub` file
 *   both `leaf` and `mid` transitively depend on changes, since `mid` never
 *   registered `hub` as one of its own webpack dependencies (see
 *   registerResolvedImportDependencies).
 * - every project file webpack doesn't bundle (one the tsconfig includes, or
 *   only reached via a type-only import): all of them when webpack can't say
 *   what changed, otherwise just the changed ones. Classic ts-loader checked
 *   these too unless `onlyCompileBundledFiles` was set.
 *
 * It also drops stored diagnostics and declaration files for files that are
 * neither in the program nor a webpack module any more (e.g. deleted), which
 * would otherwise be re-reported forever.
 *
 * Runs once per build (from addPostCompileHooks), not per compiled file:
 * each call is an O(project) scan, and running it per file was measured at
 * over 80% of build time for a wide-fanout change on a 300-file project.
 */
export function recheckAllTransitiveDependants(
  instance: TSInstance,
  compilation: webpack.Compilation,
) {
  const typeScriptInstance = instance.typeScriptApiInstance;
  const changedFileNames = typeScriptInstance.changedFilesThisBuild;
  const watcherChangedFiles = typeScriptInstance.watcherChangedFiles;
  if (
    instance.loaderOptions.transpileOnly ||
    typeScriptInstance.snapshot === undefined ||
    (changedFileNames.size === 0 && watcherChangedFiles?.size === 0)
  ) {
    return;
  }
  // Consumed up front so a later throw here can't replay the same recheck
  // (with a now-stale program) on the next build.
  typeScriptInstance.changedFilesThisBuild = new Set();
  typeScriptInstance.watcherChangedFiles = new Set();

  // Any real project file can anchor the refresh below - it's only needed to
  // get the current program. A build that compiled nothing through ts-loader
  // (e.g. only an unbundled file changed) falls back to one still on disk.
  const anchorFileName =
    changedFileNames.values().next().value ??
    findExistingProjectFile(typeScriptInstance, instance.resolvedFilePathCache);
  if (anchorFileName === undefined) {
    return;
  }

  // Re-read every file compiled this build: if fileA imports fileB and both
  // changed, fileA's compile may have seen fileB's old content. A targeted
  // list rather than a full rescan, so directImportsCache survives.
  const { primaryProject } = openPrimaryProject(
    typeScriptInstance,
    instance.resolvedFilePathCache,
    anchorFileName,
    changedFileNames,
    // The orphan program isn't the anchor's default project, so it would
    // otherwise keep serving its pre-notification content.
    { ensurePrograms: true },
  );
  if (!primaryProject) {
    return;
  }
  const { orphanProgram } = typeScriptInstance;
  const overriddenConfig = getOverriddenConfig(typeScriptInstance);
  if (overriddenConfig !== undefined) {
    if (!orphanProgram || overriddenConfig.errors.length > 0) {
      return;
    }
    // No file may have been compiled this build to pick up a changed config.
    reconfigureOrphanProgramIfStale(
      typeScriptInstance,
      instance.resolvedFilePathCache,
      overriddenConfig,
      anchorFileName,
      orphanProgram,
    );
  }
  // `primaryProject` may belong to a snapshot the reconfiguration replaced.
  const snapshot = typeScriptInstance.snapshot!;
  const primaryProgram = snapshot.getConfiguredProject(
    typeScriptInstance.configFilePath,
  )!.program;
  const orphanProjectProgram = orphanProgram
    ? snapshot.getProject(orphanProgram.id)?.program
    : undefined;
  // The orphan program also contains the whole primary project, so whenever
  // there is one it's the complete import graph to search.
  const graphProgram = orphanProjectProgram ?? primaryProgram;
  const graphProjectKey =
    (orphanProjectProgram && orphanProgram?.id) ??
    typeScriptInstance.configFilePath;

  const projectFileNames = getProjectFileNames(
    typeScriptInstance,
    instance.resolvedFilePathCache,
    graphProjectKey,
    graphProgram,
  );

  const comparableSourceFileNames = new Set(
    graphProgram
      .getSourceFileNames()
      .map(fileName =>
        toComparablePath(instance.resolvedFilePathCache, fileName),
      ),
  );

  const comparableWatcherChangedFiles = watcherChangedFiles
    ? new Set(
        [...watcherChangedFiles].map(fileName =>
          toComparablePath(instance.resolvedFilePathCache, fileName),
        ),
      )
    : undefined;

  const dependants = findTransitiveDependants(
    typeScriptInstance,
    instance.resolvedFilePathCache,
    graphProgram,
    new Set([...changedFileNames, ...(comparableWatcherChangedFiles ?? [])]),
    projectFileNames,
    comparableSourceFileNames,
  );

  const modulesByFile = determineModulesByFile(compilation, instance);

  const filesToCheck = new Map<string, string>();
  for (const dependantFileName of dependants) {
    filesToCheck.set(
      toComparablePath(instance.resolvedFilePathCache, dependantFileName),
      dependantFileName,
    );
  }
  for (const projectFileName of projectFileNames) {
    if (modulesByFile.has(instance.resolvedFilePathCache(projectFileName))) {
      continue;
    }
    // No loader call ever registers an unbundled file with webpack's
    // watcher, so its edits would otherwise never trigger a rebuild.
    compilation.fileDependencies.add(path.normalize(projectFileName));
    const comparableFileName = toComparablePath(
      instance.resolvedFilePathCache,
      projectFileName,
    );
    if (
      !comparableWatcherChangedFiles ||
      comparableWatcherChangedFiles.has(comparableFileName) ||
      // Never checked: a file created since the last build that the config
      // includes. Nothing watched it yet, so the watcher didn't report it.
      !instance.pendingDiagnostics.has(
        instance.resolvedFilePathCache(projectFileName),
      )
    ) {
      filesToCheck.set(comparableFileName, projectFileName);
    }
  }

  // No per-file loaderContext here; used for reportFiles matching and display.
  const context = compilation.compiler.context;

  // Each file is checked in the program it's compiled in (see
  // prepareSnapshotForFile), so its diagnostics match a direct compile's.
  const primaryFileNames =
    overriddenConfig !== undefined
      ? new Set<string>()
      : graphProgram === primaryProgram
        ? comparableSourceFileNames
        : new Set(
            primaryProgram
              .getSourceFileNames()
              .map(fileName =>
                toComparablePath(instance.resolvedFilePathCache, fileName),
              ),
          );

  for (const [comparableFileName, fileName] of filesToCheck) {
    const program = primaryFileNames.has(comparableFileName)
      ? primaryProgram
      : graphProgram;
    const diagnostics = dedupeDiagnostics([
      ...program.getSyntacticDiagnostics(fileName),
      ...program.getSemanticDiagnostics(fileName),
    ]);

    const fileModule = modulesByFile.get(
      instance.resolvedFilePathCache(fileName),
    )?.[0];

    const errors = filterDiagnosticsForReporting(
      instance,
      context,
      diagnostics,
    ).map(diagnostic =>
      buildTypeScriptError(instance, diagnostic, context, fileModule),
    );

    instance.pendingDiagnostics.set(instance.resolvedFilePathCache(fileName), {
      fileName,
      errors,
    });
  }

  const compilerOptions = graphProgram.getCompilerOptions();
  if (compilerOptions.declaration || compilerOptions.composite) {
    const declarationFilePathRegex = compilerOptions.allowJs
      ? constants.dtsTsTsxJsJsxRegex
      : constants.dtsTsTsxRegex;
    const comparableChangedFileNames = new Set(
      [...changedFileNames].map(fileName =>
        toComparablePath(instance.resolvedFilePathCache, fileName),
      ),
    );
    // A dependant's declarations can change with the types it imports, so
    // every rechecked file is emitted again, along with files not emitted yet.
    const staleFileNames = projectFileNames.filter(projectFileName => {
      const comparableFileName = toComparablePath(
        instance.resolvedFilePathCache,
        projectFileName,
      );
      return (
        declarationFilePathRegex.test(projectFileName) &&
        (comparableChangedFileNames.has(comparableFileName) ||
          filesToCheck.has(comparableFileName) ||
          !instance.pendingDeclarationFiles.has(
            instance.resolvedFilePathCache(projectFileName),
          ))
      );
    });
    for (const program of new Set([primaryProgram, graphProgram])) {
      recordDeclarationFiles(
        instance,
        program,
        staleFileNames.filter(
          fileName =>
            (primaryFileNames.has(
              toComparablePath(instance.resolvedFilePathCache, fileName),
            )
              ? primaryProgram
              : graphProgram) === program,
        ),
      );
    }
  }

  for (const pendingByFile of [
    instance.pendingDiagnostics,
    instance.pendingDeclarationFiles,
  ]) {
    for (const filePath of pendingByFile.keys()) {
      if (
        !modulesByFile.has(filePath) &&
        !comparableSourceFileNames.has(toForwardSlashPath(filePath))
      ) {
        pendingByFile.delete(filePath);
      }
    }
  }
}

/**
 * Errors about where `tsc` would write its output (TS5011, TS5055, TS5056,
 * TS6059). ts-loader hands its output to webpack instead, and classic
 * didn't report them when type checking. (transpileOnly does report them.)
 */
const emitLayoutDiagnosticCodes = [5011, 5055, 5056, 6059];

/**
 * Records compiler option errors (e.g. a removed option). They belong to no
 * source file, so no per-file call returns them; classic reported them via
 * `getCompilerOptionsDiagnostics`. They go on the compilation, not a module:
 * webpack keeps a module's errors until that module is rebuilt.
 *
 * `getGlobalDiagnostics()` is deliberately not called: it checks the whole
 * program (about 200ms per rebuild of a 300-file project).
 */
export function recordProgramDiagnostics(
  instance: TSInstance,
  compilation: webpack.Compilation,
) {
  const typeScriptInstance = instance.typeScriptApiInstance;
  const { snapshot, configFilePath } = typeScriptInstance;
  const { transpileOnly } = instance.loaderOptions;
  // What the errors are read from; they only change when it does.
  const source = transpileOnly ? typeScriptInstance.transpileConfig : snapshot;
  if (source === undefined) {
    return;
  }

  if (typeScriptInstance.programErrorsSource !== source) {
    const context = compilation.compiler.context;
    typeScriptInstance.programErrors = filterDiagnosticsForReporting(
      instance,
      context,
      transpileOnly
        ? (typeScriptInstance.transpileConfigDiagnostics ?? [])
        : getTypeCheckProgramDiagnostics(snapshot!, typeScriptInstance),
    ).map(diagnostic =>
      buildTypeScriptError(
        instance,
        diagnostic,
        context,
        undefined,
        configFilePath,
      ),
    );
    typeScriptInstance.programErrorsSource = source;
  }

  // Set every build: recheckAllTransitiveDependants drops entries for files
  // that are neither a module nor a source file.
  const key = instance.resolvedFilePathCache(configFilePath);
  const errors = typeScriptInstance.programErrors ?? [];
  if (errors.length > 0) {
    instance.pendingDiagnostics.set(key, { fileName: configFilePath, errors });
  } else {
    instance.pendingDiagnostics.delete(key);
  }
}

function getTypeCheckProgramDiagnostics(
  snapshot: Snapshot,
  typeScriptInstance: TypeScriptInstance,
): Diagnostic[] {
  const { configOverrides, orphanProgram, configFilePath } = typeScriptInstance;
  // With config overrides, the synthetic program is the one with the
  // overridden options.
  const program =
    configOverrides === undefined
      ? snapshot.getConfiguredProject(configFilePath)?.program
      : orphanProgram && snapshot.getProject(orphanProgram.id)?.program;
  // A config that fails to parse is already reported as a hard failure.
  if (!program || program.getConfigFileParsingDiagnostics().length > 0) {
    return [];
  }
  return dedupeDiagnostics(program.getProgramDiagnostics()).filter(
    diagnostic => !emitLayoutDiagnosticCodes.includes(diagnostic.code),
  );
}

/**
 * A project file (api-facing name) that still exists on disk, taken from the
 * instance's current, pre-refresh snapshot - see recheckAllTransitiveDependants.
 */
function findExistingProjectFile(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
): string | undefined {
  // With config overrides the project opened from tsconfig.json isn't the
  // one compiled, and under `context` it may hold no files at all.
  const overriddenConfig = getOverriddenConfig(typeScriptInstance);
  if (overriddenConfig !== undefined) {
    return overriddenConfig.fileNames.find(fileName => fs.existsSync(fileName));
  }
  const program = typeScriptInstance.snapshot?.getConfiguredProject(
    typeScriptInstance.configFilePath,
  )?.program;
  if (!program) {
    return undefined;
  }
  return getProjectFileNames(
    typeScriptInstance,
    resolvedFilePathCache,
    typeScriptInstance.configFilePath,
    program,
  ).find(fileName => fs.existsSync(fileName));
}

/**
 * Every project file that (directly or transitively) imports any file in
 * `changedFileNames`, via breadth-first search over each file's direct
 * resolved imports (see getDirectResolvedImports/getCachedDirectResolvedImports).
 */
function findTransitiveDependants(
  typeScriptInstance: TypeScriptInstance,
  resolvedPathCache: ResolvedFilePathCache,
  program: Program,
  changedFileNames: ReadonlySet<string>,
  projectFileNames: readonly string[],
  comparableSourceFileNames: ReadonlySet<string>,
): Set<string> {
  // `projectFileNames` are forward-slashed but resolved imports are
  // OS-native; everything is compared via toComparablePath, or multi-hop
  // dependants are missed on Windows.
  const directImports = getCachedDirectResolvedImports(
    typeScriptInstance,
    resolvedPathCache,
    program,
    projectFileNames,
    comparableSourceFileNames,
  );
  const directImportsByFile = new Map(
    projectFileNames.map((candidateFileName, index) => [
      candidateFileName,
      directImports[index].map(fileName =>
        toComparablePath(resolvedPathCache, fileName),
      ),
    ]),
  );

  // Changed files can also be found as dependants: one that imports another
  // changed file may have been checked against its old content.
  const comparableChangedFileNames = new Set(
    [...changedFileNames].map(fileName =>
      toComparablePath(resolvedPathCache, fileName),
    ),
  );
  const dependants = new Set<string>();
  let frontier = comparableChangedFileNames;

  while (frontier.size > 0) {
    const nextFrontier = new Set<string>();

    for (const [candidateFileName, directImports] of directImportsByFile) {
      if (dependants.has(candidateFileName)) {
        continue;
      }

      if (
        directImports.some(importedFileName => frontier.has(importedFileName))
      ) {
        dependants.add(candidateFileName);
        nextFrontier.add(
          toComparablePath(resolvedPathCache, candidateFileName),
        );
      }
    }

    frontier = nextFrontier;
  }

  return dependants;
}

function toForwardSlashPath(fileName: string): string {
  return fileName.replace(/\\/g, '/');
}

/**
 * The form to use when comparing against API file names: forward-slashed and
 * case-canonicalized, since API and webpack names for the same file can
 * differ in both on Windows / case-insensitive filesystems.
 */
function toComparablePath(
  resolvedFilePathCache: ResolvedFilePathCache,
  fileName: string,
): string {
  return toForwardSlashPath(resolvedFilePathCache(fileName));
}

/**
 * Records the declarations of `fileNames`, in one request. Called from the
 * end-of-build recheck for the whole project, not per compiled file (e.g. an
 * allowJs .js file never reaches the loader) - matching classic's
 * `provideDeclarationFilesToWebpack`. Emitting every project file on each
 * loader call made a 300-file build with `declaration` take 16s, not 1.2s.
 */
function recordDeclarationFiles(
  instance: TSInstance,
  program: Program,
  fileNames: readonly string[],
) {
  if (fileNames.length === 0) {
    return;
  }
  const declarationEmits = instance.typeScriptApiInstance.api.batch(
    ...fileNames.map(fileName => program.getDeclarationEmit.gen([fileName])),
  );
  fileNames.forEach((fileName, index) => {
    instance.pendingDeclarationFiles.set(
      instance.resolvedFilePathCache(fileName),
      [...declarationEmits[index].outputFiles].map(
        ([declarationFileName, declarationOutputFile]) => ({
          fileName: declarationFileName,
          text: declarationOutputFile.text,
        }),
      ),
    );
  });
}
