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

import * as constants from './constants';
import {
  buildTypeScriptError,
  dedupeDiagnostics,
  determineModulesByFile,
  filterDiagnosticsForReporting,
  isRestoredModuleOfInstance,
  reportTypeScriptErrors,
} from './diagnostics';
import type {
  ConfigOverrides,
  CreateFileSystemLayer,
  LoaderOptions,
  SourceFileNames,
  SyntheticProgram,
  TypeScriptInstance,
  TSInstance,
  ResolvedFilePathCache,
} from './types';
import { isWebpack5 } from './loaderUtils';

interface TypeScriptApiModule {
  API: new (options?: APIOptions) => API;
  createFileSystemLayer: CreateFileSystemLayer;
}

export function createTypeScriptInstance(
  loaderOptions: LoaderOptions,
  configFilePath: string,
  useCaseSensitiveFileNames: boolean,
  outputPath: string | undefined,
): TypeScriptInstance {
  const typeScriptApiModule = loadTypeScriptApiModule(loaderOptions.compiler);
  // No `fs` callbacks: the API reads disk directly, with webpack's content
  // layered on top per file (see layerFileContents). Case sensitivity is
  // passed explicitly so the API agrees with `resolvedFilePathCache`.
  const api = new typeScriptApiModule.API({ useCaseSensitiveFileNames });

  return {
    api,
    createFileSystemLayer: typeScriptApiModule.createFileSystemLayer,
    configFilePath: path.resolve(configFilePath),
    configOverrides: getConfigOverrides(loaderOptions),
    useCaseSensitiveFileNames,
    outputPath,
    transpileConfig: undefined,
    orphanRootFileNames: new Map(),
    fileLayers: new Map(),
    unsentFileLayers: new Map(),
    primaryProjectOpened: false,
    pendingInvalidation: true,
    directImportsCache: new Map(),
    projectFileNamesCache: new Map(),
    sourceFileNamesCache: new Map(),
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
    options: removeOrphanedOptions(parsedConfig.options, compilerOptions),
    ...(error ? { errors: [error] } : {}),
  };
}

/**
 * Each option with the options it needs at least one of (TS5051, TS5069).
 * Ordered so that an option dropped here is seen by the entries after it.
 */
const dependentOptions: readonly (readonly [string, ...string[]])[] = [
  ['declarationMap', 'declaration', 'composite'],
  ['declarationDir', 'declaration', 'composite'],
  ['emitDeclarationOnly', 'declaration', 'composite'],
  ['inlineSources', 'sourceMap', 'inlineSourceMap'],
  ['sourceRoot', 'sourceMap', 'inlineSourceMap'],
  ['mapRoot', 'sourceMap', 'declarationMap'],
];

/**
 * When the `compilerOptions` loader option names an option and leaves it
 * off, the options that then have nothing they need are dropped with it, so
 * one override is enough. An option the override sets itself is kept, and
 * so errors if it lacks what it needs.
 */
function removeOrphanedOptions(
  options: CompilerOptions,
  overrides: Record<string, unknown>,
): CompilerOptions {
  const remaining: Record<string, unknown> = { ...options };
  // The options the override is responsible for being off: the ones it
  // names, and each one dropped here because of them.
  const turnedOff = new Set(Object.keys(overrides));
  for (const [dependentOption, ...neededOptions] of dependentOptions) {
    if (
      !(dependentOption in overrides) &&
      neededOptions.some(option => turnedOff.has(option)) &&
      !neededOptions.some(option => remaining[option])
    ) {
      // Only an option that was set carries the chain on: an unset one
      // wasn't turned off by anything.
      if (dependentOption in remaining) {
        turnedOff.add(dependentOption);
      }
      delete remaining[dependentOption];
    }
  }
  return remaining;
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
      previous.outputPath,
    ),
    // Their dependants still need the end-of-build recheck.
    changedFilesThisBuild: previous.changedFilesThisBuild,
    // The new process has none of the layers the old one was sent.
    fileLayers: previous.fileLayers,
    unsentFileLayers: new Map(previous.fileLayers),
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
    project.id,
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
  let specifier = `${compilerPackage}/sync`;

  // Loaded here, not by a top-level import: on a Node.js or TypeScript that
  // can't load them, that would fail before the errors below could explain.
  try {
    const { API } = require(specifier) as Pick<TypeScriptApiModule, 'API'>;
    specifier = `${compilerPackage}/fs`;
    const { createFileSystemLayer } = require(specifier) as Pick<
      TypeScriptApiModule,
      'createFileSystemLayer'
    >;
    return { API, createFileSystemLayer };
  } catch (error) {
    const loadError = `Could not load the TypeScript API from "${specifier}": ${
      error instanceof Error ? error.message : String(error)
    }`;
    // `typescript/sync` is an ES module, which Node.js before 22.12 can't
    // `require`. Later versions give the same code when it's turned off.
    const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
    if (
      (error as NodeJS.ErrnoException).code === 'ERR_REQUIRE_ESM' &&
      (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12))
    ) {
      throw new Error(
        `ts-loader needs Node.js 22.12 or later; this is Node.js ${
          process.versions.node
        }.${constants.EOL}${loadError}`,
      );
    }
    const version = getCompilerVersion(compilerPackage);
    // A new enough compiler failed to load for some other reason.
    throw new Error(
      version !== undefined && isTypeScript71OrLater(version)
        ? loadError
        : `ts-loader needs TypeScript 7.1 or later; "${compilerPackage}" ${
            version === undefined
              ? 'could not be loaded'
              : `is version ${version}`
          }. For earlier versions of TypeScript, use ts-loader 9.${
            constants.EOL
          }${loadError}`,
    );
  }
}

/** `undefined` if it isn't installed, or its `exports` hide package.json. */
function getCompilerVersion(compilerPackage: string): string | undefined {
  try {
    return (require(`${compilerPackage}/package.json`) as { version?: string })
      .version;
  } catch {
    return undefined;
  }
}

function isTypeScript71OrLater(version: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  return major > 7 || (major === 7 && minor >= 1);
}

type SnapshotChanges = Pick<
  CreateSnapshotParams,
  | 'openProjects'
  | 'createPrograms'
  | 'reconfigurePrograms'
  | 'removePrograms'
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
  // Only the first snapshot update of a rebuild has pending changes, and so
  // anything to compare with the file list.
  const knownFileNames = typeScriptInstance.pendingChangedFiles
    ? getLastKnownFileNames(typeScriptInstance, resolvedFilePathCache)
    : undefined;
  const createdFiles = findCreatedFiles(
    typeScriptInstance,
    resolvedFilePathCache,
    knownFileNames,
  );
  const newlyIncludedFileNames = findNewlyIncludedFileNames(
    typeScriptInstance,
    resolvedFilePathCache,
    knownFileNames,
  );
  // A newly included file needs the full rescan: naming it as created adds
  // it to the project on Linux, but was seen to do nothing on Windows.
  const fileNotifications =
    typeScriptInstance.pendingInvalidation || newlyIncludedFileNames.length > 0
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
  if (
    typeScriptInstance.pendingInvalidation ||
    createdFiles.size > 0 ||
    newlyIncludedFileNames.length > 0
  ) {
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
    fileSystem: layerUnsentFiles(typeScriptInstance),
  };
  // The API keeps no "latest snapshot" of its own, so each one must be built
  // via `update` on the previous to keep its cache
  // (https://github.com/microsoft/TypeScript/pull/64204).
  const snapshot = previousSnapshot
    ? previousSnapshot.update(params)
    : typeScriptInstance.api.createSnapshot(params);

  // Only now: a failed update must leave them owed.
  typeScriptInstance.unsentFileLayers.clear();
  typeScriptInstance.snapshot = snapshot;
  previousSnapshot?.dispose?.();
  // Notifications, a new root or new options can all change a program's files.
  typeScriptInstance.sourceFileNamesCache.clear();

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
  knownFileNames: ReadonlySet<string> | undefined,
): ReadonlySet<string> {
  const changedFiles = typeScriptInstance.pendingChangedFiles;
  if (!changedFiles || !knownFileNames) {
    return new Set();
  }
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

/**
 * The files the config includes that the primary program didn't contain
 * when its file list was last read. Nothing watches a file that webpack
 * doesn't bundle until it's in the program, so the watcher can't report its
 * creation, and the API doesn't look for new files by itself.
 */
function findNewlyIncludedFileNames(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  knownFileNames: ReadonlySet<string> | undefined,
): string[] {
  if (!knownFileNames) {
    return [];
  }
  // With config overrides the config has been parsed for this build anyway.
  const overriddenConfig = getOverriddenConfig(typeScriptInstance);
  if (
    overriddenConfig === undefined &&
    !haveProjectDirectoriesChanged(typeScriptInstance, resolvedFilePathCache)
  ) {
    return [];
  }
  return (
    overriddenConfig ??
    typeScriptInstance.api.parseConfigFile(typeScriptInstance.configFilePath)
  ).fileNames.filter(
    fileName =>
      !knownFileNames.has(toComparablePath(resolvedFilePathCache, fileName)) &&
      // A `files` entry that doesn't exist can never join the program, and
      // would otherwise force the rescan on every rebuild.
      fs.existsSync(fileName),
  );
}

/**
 * Whether a file may have been created since the last call: creating one
 * changes the modified time of its directory. Parsing the config to look
 * for new files lists every directory it covers; a stat per directory is
 * cheaper, and almost always says no.
 *
 * Watched: every directory under the config file's, since `include` can
 * match one that holds no project file yet. Where that can't cover every
 * place a file could appear, this always answers yes.
 */
function haveProjectDirectoriesChanged(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
): boolean {
  const projectFileNames = typeScriptInstance.projectFileNamesCache.get(
    resolvedFilePathCache(
      typeScriptInstance.orphanProgram?.id ?? typeScriptInstance.configFilePath,
    ),
  )?.result;
  if (!projectFileNames) {
    return true;
  }
  const configDirectory = path.dirname(typeScriptInstance.configFilePath);
  let directories = typeScriptInstance.projectDirectories;
  if (directories?.fileNames !== projectFileNames) {
    // The first check, or files came or went: decide again whether the
    // config's directory covers the project.
    const covered = isCoveredByDirectory(configDirectory, projectFileNames);
    // webpack's output directory gains files on rebuilds, which would mean a
    // parse each time; it's left out unless the project has files in it.
    const { outputPath } = typeScriptInstance;
    const skippedDirectory =
      outputPath !== undefined &&
      !projectFileNames.some(fileName => isInDirectory(outputPath, fileName))
        ? outputPath
        : undefined;
    const unwatchable = directories?.unwatchable ?? false;
    const keptTimes =
      covered &&
      !unwatchable &&
      directories?.skippedDirectory === skippedDirectory
        ? directories?.modifiedTimes
        : undefined;
    directories = {
      fileNames: projectFileNames,
      modifiedTimes: keptTimes,
      skippedDirectory,
      unwatchable,
    };
    typeScriptInstance.projectDirectories = directories;
    if (keptTimes === undefined) {
      if (covered && !unwatchable) {
        const walkedTimes = new Map<string, number>();
        if (addDirectoryTree(configDirectory, walkedTimes, skippedDirectory)) {
          directories.modifiedTimes = walkedTimes;
        } else {
          directories.unwatchable = true;
        }
      }
      return true;
    }
  }
  const { modifiedTimes } = directories;
  if (modifiedTimes === undefined) {
    return true;
  }
  let changed = false;
  // Directories added along the way are visited too, and are up to date.
  for (const [directory, previousModifiedTime] of modifiedTimes) {
    const modifiedTime = getModifiedTime(directory);
    if (modifiedTime === previousModifiedTime) {
      continue;
    }
    changed = true;
    if (modifiedTime === -1) {
      modifiedTimes.delete(directory);
    } else if (
      !addDirectoryTree(directory, modifiedTimes, directories.skippedDirectory)
    ) {
      // A new directory always changes its parent's time, so listing the
      // changed ones again keeps the tree complete.
      directories.modifiedTimes = undefined;
      directories.unwatchable = true;
      return true;
    }
  }
  return changed;
}

/** Beyond this many directories a stat of each is no longer a clear win. */
const maxWatchedDirectories = 5000;

/**
 * Whether every place a new project file could appear is in the tree that
 * addDirectoryTree walks from `directory`.
 */
function isCoveredByDirectory(
  directory: string,
  projectFileNames: readonly string[],
): boolean {
  return projectFileNames.every(
    fileName =>
      isInDirectory(directory, fileName) &&
      !path
        .relative(directory, path.resolve(fileName))
        .split(path.sep)
        .some(isSkippedDirectoryName),
  );
}

function isInDirectory(directory: string, fileName: string): boolean {
  const relativePath = path.relative(directory, path.resolve(fileName));
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function isSkippedDirectoryName(name: string): boolean {
  return name === 'node_modules' || name === '.git';
}

/**
 * Records the modified time of `directory` and of every directory under it
 * that isn't recorded yet, leaving out `skippedDirectory`. Returns false if
 * the tree can't be watched: it is too large, or holds a link to a directory,
 * whose contents this won't see. The caller doesn't try again after that: a
 * walk that fails is a walk of most of the tree.
 */
function addDirectoryTree(
  directory: string,
  modifiedTimes: Map<string, number>,
  skippedDirectory: string | undefined,
): boolean {
  modifiedTimes.set(directory, getModifiedTime(directory));
  if (modifiedTimes.size > maxWatchedDirectories) {
    return false;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    // gone since it was listed; its parent's time has changed too
    return true;
  }
  for (const entry of entries) {
    const child = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (isDirectory(child)) {
        return false;
      }
    } else if (
      entry.isDirectory() &&
      !isSkippedDirectoryName(entry.name) &&
      !modifiedTimes.has(child) &&
      (skippedDirectory === undefined ||
        path.relative(skippedDirectory, child) !== '') &&
      !addDirectoryTree(child, modifiedTimes, skippedDirectory)
    ) {
      return false;
    }
  }
  return true;
}

function isDirectory(fileName: string): boolean {
  try {
    return fs.statSync(fileName).isDirectory();
  } catch {
    return false;
  }
}

/** -1 for a directory that is gone. */
function getModifiedTime(directory: string): number {
  try {
    return fs.statSync(directory).mtimeMs;
  } catch {
    return -1;
  }
}

/** Comparable names; `undefined` before the file list has been read. */
function getLastKnownFileNames(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
): ReadonlySet<string> | undefined {
  // The orphan program contains the whole primary project too.
  const lastKnownFileNames = typeScriptInstance.projectFileNamesCache.get(
    resolvedFilePathCache(
      typeScriptInstance.orphanProgram?.id ?? typeScriptInstance.configFilePath,
    ),
  )?.sourceFileNames;
  return (
    lastKnownFileNames &&
    new Set(
      lastKnownFileNames.map(fileName =>
        toComparablePath(resolvedFilePathCache, fileName),
      ),
    )
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
 *
 * A snapshot update costs time that grows with the project, and usually the
 * API has read the same text from disk as webpack did. Such a file's layer
 * waits for the next update anything else needs - the end-of-build recheck
 * at the latest, which would otherwise re-read the file from disk.
 */
function layerFileContents(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  fileName: string,
  contents: string,
): Snapshot {
  forgetRemovedFileLayers(typeScriptInstance);
  typeScriptInstance.fileLayers.set(fileName, contents);
  typeScriptInstance.unsentFileLayers.set(fileName, contents);
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
      { ensurePrograms: true },
    ).snapshot;
  }
  const previousSnapshot = typeScriptInstance.snapshot;
  if (
    snapshotHasContents(
      typeScriptInstance,
      previousSnapshot,
      fileName,
      contents,
    )
  ) {
    return previousSnapshot;
  }
  const snapshot = previousSnapshot.update({
    fileSystem: layerUnsentFiles(typeScriptInstance),
    ensurePrograms: true,
  });
  typeScriptInstance.unsentFileLayers.clear();
  typeScriptInstance.snapshot = snapshot;
  previousSnapshot.dispose();
  // New contents can add or drop imports, and so files.
  typeScriptInstance.sourceFileNamesCache.clear();
  return snapshot;
}

/** So that a restarted process isn't handed files that are gone. */
function forgetRemovedFileLayers(typeScriptInstance: TypeScriptInstance) {
  for (const removedFileName of typeScriptInstance.pendingRemovedFiles ?? []) {
    const fileName = toApiFacingFileName(removedFileName);
    typeScriptInstance.fileLayers.delete(fileName);
    typeScriptInstance.unsentFileLayers.delete(fileName);
  }
}

/** The caller clears `unsentFileLayers` once its update has gone through. */
function layerUnsentFiles(typeScriptInstance: TypeScriptInstance) {
  const { unsentFileLayers, createFileSystemLayer } = typeScriptInstance;
  return unsentFileLayers.size === 0
    ? undefined
    : createFileSystemLayer([...unsentFileLayers]);
}

/**
 * Every program that holds the file has to agree: the file is compiled in
 * one of them, and a program can lag behind the snapshot's files.
 */
function snapshotHasContents(
  typeScriptInstance: TypeScriptInstance,
  snapshot: Snapshot,
  fileName: string,
  contents: string,
): boolean {
  const { configFilePath, orphanProgram } = typeScriptInstance;
  const primaryText = snapshot
    .getConfiguredProject(configFilePath)
    ?.program.getSourceFile(fileName)?.text;
  if (primaryText !== undefined && primaryText !== contents) {
    return false;
  }
  const orphanText =
    orphanProgram &&
    snapshot.getProject(orphanProgram.id)?.program.getSourceFile(fileName)
      ?.text;
  return orphanText === undefined
    ? primaryText !== undefined
    : orphanText === contents;
}

/**
 * `program.getSourceFileNames()`, which costs a round trip that grows with
 * the project, fetched once for as long as the program's files can't have
 * changed - see where `sourceFileNamesCache` is cleared. Asking for it on
 * every compiled file was over half the time of a 4800-file build.
 */
function getSourceFileNames(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  projectId: string,
  program: Program,
): SourceFileNames {
  const { sourceFileNamesCache } = typeScriptInstance;
  let cached = sourceFileNamesCache.get(projectId);
  if (cached === undefined) {
    const fileNames = program.getSourceFileNames();
    cached = {
      fileNames,
      comparableFileNames: new Set(
        fileNames.map(fileName =>
          toComparablePath(resolvedFilePathCache, fileName),
        ),
      ),
    };
    sourceFileNamesCache.set(projectId, cached);
  }
  return cached;
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
  projectId: string,
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
    projectId,
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
    registerResolvedImportDependencies(
      instance.typeScriptApiInstance,
      instance.resolvedFilePathCache,
      program,
      apiFileName,
      getSourceFileNames(
        instance.typeScriptApiInstance,
        instance.resolvedFilePathCache,
        projectId,
        program,
      ).comparableFileNames,
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
 * cached per project and compared against the source file list the cached
 * result came from (see getSourceFileNames): content-only edits leave it
 * unchanged (cache hit), adding/removing a file changes it (reclassify). That
 * self-check means the cache never needs invalidating, unlike
 * `directImportsCache`.
 */
function getProjectFileNames(
  typeScriptInstance: TypeScriptInstance,
  resolvedFilePathCache: ResolvedFilePathCache,
  projectKey: string,
  projectId: string,
  program: Program,
): readonly string[] {
  const cachedFilePath = resolvedFilePathCache(projectKey);
  const sourceFileNames = getSourceFileNames(
    typeScriptInstance,
    resolvedFilePathCache,
    projectId,
    program,
  ).fileNames;
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
  if (a === b) {
    return true;
  }
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
  projectId: string,
  program: Program,
): readonly string[] {
  return getProjectFileNames(
    typeScriptInstance,
    resolvedFilePathCache,
    projectKey,
    projectId,
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
  const currentPrimaryProject = snapshot.getConfiguredProject(
    typeScriptInstance.configFilePath,
  )!;
  const primaryProgram = currentPrimaryProject.program;
  const orphanProjectProgram = orphanProgram
    ? snapshot.getProject(orphanProgram.id)?.program
    : undefined;
  // The orphan program also contains the whole primary project, so whenever
  // there is one it's the complete import graph to search.
  const graphProgram = orphanProjectProgram ?? primaryProgram;
  const graphProjectKey =
    (orphanProjectProgram && orphanProgram?.id) ??
    typeScriptInstance.configFilePath;
  const graphProjectId =
    (orphanProjectProgram && orphanProgram?.id) ?? currentPrimaryProject.id;

  const projectFileNames = getProjectFileNames(
    typeScriptInstance,
    instance.resolvedFilePathCache,
    graphProjectKey,
    graphProjectId,
    graphProgram,
  );

  const comparableSourceFileNames = getSourceFileNames(
    typeScriptInstance,
    instance.resolvedFilePathCache,
    graphProjectId,
    graphProgram,
  ).comparableFileNames;

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
    const projectFilePath = instance.resolvedFilePathCache(projectFileName);
    const fileModules = modulesByFile.get(projectFilePath);
    if (fileModules !== undefined) {
      // A module webpack restored from its persistent cache was last checked
      // by an earlier process. Its errors may no longer hold, and a file it
      // reaches only through type-only imports may have changed since
      // without webpack seeing a reason to rebuild it.
      if (
        !instance.pendingDiagnostics.has(projectFilePath) &&
        fileModules.some(fileModule =>
          isRestoredModuleOfInstance(
            compilation,
            fileModule,
            instance.loaderOptions,
          ),
        )
      ) {
        filesToCheck.set(
          toComparablePath(instance.resolvedFilePathCache, projectFileName),
          projectFileName,
        );
      }
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
        : getSourceFileNames(
            typeScriptInstance,
            instance.resolvedFilePathCache,
            currentPrimaryProject.id,
            primaryProgram,
          ).comparableFileNames;

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
  // Recorded declarations were emitted with the options of the time; a
  // tsconfig.json change can move or reword all of them, or turn them off.
  const declarationOptions = JSON.stringify(compilerOptions);
  if (instance.declarationOptions !== declarationOptions) {
    instance.pendingDeclarationFiles.clear();
    instance.declarationOptions = declarationOptions;
  }
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
  const project = typeScriptInstance.snapshot?.getConfiguredProject(
    typeScriptInstance.configFilePath,
  );
  if (!project) {
    return undefined;
  }
  return getProjectFileNames(
    typeScriptInstance,
    resolvedFilePathCache,
    typeScriptInstance.configFilePath,
    project.id,
    project.program,
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
 * Records the declarations of `fileNames`, in batched requests. Called from the
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
  const { api } = instance.typeScriptApiInstance;
  // In chunks, to bound the size of a request and of its response.
  for (let start = 0; start < fileNames.length; start += 1000) {
    const chunk = fileNames.slice(start, start + 1000);
    const declarationEmits = api.batch(
      ...chunk.map(fileName => program.getDeclarationEmit.gen([fileName])),
    );
    chunk.forEach((fileName, index) => {
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
}
