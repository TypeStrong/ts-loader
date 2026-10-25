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
  ModuleResolver,
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
  LoaderOptions,
  ParentModuleResolver,
  PendingDeclarationFile,
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
    transpileConfig: undefined,
    orphanRootFileNames: new Map(),
    primaryProjectOpened: false,
    pendingInvalidation: true,
    directImportsCache: new Map(),
    projectFileNamesCache: new Map(),
    changedFilesThisBuild: new Set(),
    watcherChangedFiles: undefined,
    customResolveModuleName: loaderOptions.resolveModuleName,
  };
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
  const { snapshot, syntheticProgramId } = prepareSnapshotForFile(
    typeScriptInstance,
    instance.resolvedFilePathCache,
    apiFileName,
    contents,
    forceSyntheticRoot,
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

  if (
    program.getCompilerOptions().declaration ||
    program.getCompilerOptions().composite
  ) {
    recordProjectDeclarationFiles(instance, program);
  }

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

  const errors = filterDiagnosticsForReporting(
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
  if (!typeScriptInstance.transpileConfigDiagnosticsReported) {
    errors.push(
      ...filterDiagnosticsForReporting(
        instance,
        loaderContext.context,
        typeScriptInstance.transpileConfigDiagnostics ?? [],
      ).map(diagnostic =>
        buildTypeScriptError(
          instance,
          diagnostic,
          loaderContext.context,
          loaderContext._module,
          typeScriptInstance.configFilePath,
        ),
      ),
    );
    typeScriptInstance.transpileConfigDiagnosticsReported = true;
  }

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
    typeScriptInstance.transpileConfig = typeScriptInstance.api.parseConfigFile(
      typeScriptInstance.configFilePath,
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
    typeScriptInstance.transpileConfigDiagnosticsReported = false;
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
 * output path is computed here. Emitted directly rather than via
 * `pendingDeclarationFiles`: transpileOnly never registers addPostCompileHooks.
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
          changed: mapApiFacingFileNames(
            typeScriptInstance.pendingChangedFiles &&
              new Set(
                [...typeScriptInstance.pendingChangedFiles].filter(
                  fileName => !createdFiles.has(fileName),
                ),
              ),
          ),
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
 * The TypeScript/JavaScript files in `pendingChangedFiles` that the primary
 * program didn't contain when its file list was last read (see
 * getProjectFileNames) - created, or restored after a deletion, rather than
 * edited, since webpack's watcher reports both as modified.
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
  return new Set(
    [...changedFiles].filter(
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
): { snapshot: Snapshot; syntheticProgramId?: SyntheticProjectId } {
  // Layered first: a layered file appears in directory listings, so it can
  // change what the project's `include` globs match.
  const snapshot = layerFileContents(
    typeScriptInstance,
    resolvedFilePathCache,
    fileName,
    contents,
  );
  const primaryProjectPath = typeScriptInstance.configFilePath;
  const primaryProject = snapshot.getConfiguredProject(primaryProjectPath);

  if (
    !forceSyntheticRoot &&
    !typeScriptInstance.customResolveModuleName &&
    primaryProject?.program.getSourceFile(fileName)
  ) {
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

  orphanRootFileNames.set(canonicalFileName, fileName);
  const program = orphanProgramParams(typeScriptInstance, primaryConfig);
  const configuration = serializeOrphanProgramParams(program);
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
  const configuration = serializeOrphanProgramParams(program);
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
    options: {
      projectReferences: primaryConfig.projectReferences,
      moduleResolver: getCustomModuleResolver(
        typeScriptInstance,
        primaryConfig.options,
      ),
    },
  };
}

/** `ModuleResolver` holds the API client, so it's serialized by id. */
function serializeOrphanProgramParams(
  program: ReturnType<typeof orphanProgramParams>,
): string {
  return JSON.stringify({
    ...program,
    options: {
      ...program.options,
      moduleResolver: program.options.moduleResolver?.id,
    },
  });
}

/**
 * Adapts the `resolveModuleName` loader option (classic ts-loader's
 * signature) to the API's resolver callback. Only synthetic programs accept
 * a resolver, so with this option set every file compiles in the orphan
 * program (see prepareSnapshotForFile). Recreated when compiler options
 * change, since the default resolution behind `parentResolver` depends on them.
 */
function getCustomModuleResolver(
  typeScriptInstance: TypeScriptInstance,
  compilerOptions: CompilerOptions,
): ModuleResolver | undefined {
  const customResolveModuleName = typeScriptInstance.customResolveModuleName;
  if (!customResolveModuleName) {
    return undefined;
  }
  const configuration = JSON.stringify(compilerOptions);
  if (
    typeScriptInstance.customModuleResolver?.configuration === configuration
  ) {
    return typeScriptInstance.customModuleResolver.resolver;
  }

  // A resolver replaced here may still back the current snapshot's program,
  // so it isn't disposed; api.close() releases it.
  const { api } = typeScriptInstance;
  const defaultResolver = api.createModuleResolver(compilerOptions);
  const resolver = api.createModuleResolver(compilerOptions, {
    resolveModuleName(
      moduleName,
      containingDirectory,
      resolutionMode,
      options,
    ) {
      const parentResolver: ParentModuleResolver = (
        parentModuleName,
        containingFile,
      ) =>
        defaultResolver.resolveModuleName(
          parentModuleName,
          path.dirname(containingFile),
          resolutionMode,
          { snapshot: options.snapshot },
        );
      // The API only says which directory the import is in, not which file.
      const containingFile = path.join(
        containingDirectory,
        constants.unknownContainingFileName,
      );
      const resolvedModule = customResolveModuleName(
        moduleName,
        containingFile,
        compilerOptions,
        undefined,
        parentResolver,
      )?.resolvedModule;
      return resolvedModule
        ? {
            resolvedFileName: resolvedModule.resolvedFileName,
            originalPath: resolvedModule.originalPath,
            packageId: resolvedModule.packageId,
          }
        : undefined;
    },
  });
  typeScriptInstance.customModuleResolver = { resolver, configuration };
  return resolver;
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
  const { snapshot, primaryProject } = openPrimaryProject(
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
  const primaryProgram = primaryProject.program;
  const { orphanProgram } = typeScriptInstance;
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
      comparableWatcherChangedFiles.has(comparableFileName)
    ) {
      filesToCheck.set(comparableFileName, projectFileName);
    }
  }

  // No per-file loaderContext here; used for reportFiles matching and display.
  const context = compilation.compiler.context;

  // Each file is checked in the program it's compiled in (see
  // prepareSnapshotForFile), so its diagnostics match a direct compile's.
  const primaryFileNames =
    graphProgram === primaryProgram
      ? comparableSourceFileNames
      : new Set(
          primaryProgram
            .getSourceFileNames()
            .map(fileName =>
              toComparablePath(instance.resolvedFilePathCache, fileName),
            ),
        );

  for (const [comparableFileName, fileName] of filesToCheck) {
    // With a custom resolver, only the orphan program resolves imports correctly.
    const program =
      primaryFileNames.has(comparableFileName) &&
      !typeScriptInstance.customResolveModuleName
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
 * A project file (api-facing name) that still exists on disk, taken from the
 * instance's current, pre-refresh snapshot - see recheckAllTransitiveDependants.
 */
function findExistingProjectFile(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
): string | undefined {
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
 * Records declarations for the whole project, not just the current file
 * (e.g. an allowJs .js file never reaches the loader) - matching classic's
 * `provideDeclarationFilesToWebpack`.
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
