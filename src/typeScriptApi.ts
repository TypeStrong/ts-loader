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

  // Synthetic tsconfig files (see ensureSyntheticConfigForFile) live only in
  // this map, served via the `readFile` override below - never written to
  // real disk. Their path is always a sibling of the real config they
  // `extends`, so no `fileExists`/`directoryExists` override is needed for
  // the API to treat their directory as real.
  const syntheticConfigContents = new Map<string, string>();

  return {
    // `instance.files` holds ts-loader's own post-transform text for every
    // file it has compiled (other loaders, e.g. a pre-processor chained
    // before ts-loader, may have altered it before we saw it). These
    // overrides serve that instead of hitting real disk, falling through to
    // disk (`undefined`) for anything not in `files` (ambient .d.ts, etc.) -
    // matching classic ts-loader's own LanguageServiceHost.
    api: new typeScriptApiModule.API({
      fs: {
        // A purely synthetic identity (e.g. `component.vue.ts` for a
        // `component.vue` compiled via `appendTsSuffixTo`) has no real disk
        // entry, so without this override resolving/validating it reports
        // "File not found" (TS6053) even though `readFile` can serve its
        // content. `true`/`undefined` (not `false`) preserves fallback to
        // real disk for anything we don't know about.
        fileExists: fileName =>
          syntheticConfigContents.has(toComparablePath(fileName)) ||
          files.has(filePathKeyMapper(fileName))
            ? true
            : undefined,
        // Compared via toComparablePath since the API may hand back a
        // different path spelling (e.g. backslashes on Windows) than what
        // ensureSyntheticConfigForFile stored the content under.
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
  // A node_modules file can be discovered via ordinary import resolution
  // without ever being a root file, and the API skips emit for a source
  // file in that position - matching classic ts-loader's default refusal to
  // compile .ts under node_modules. `allowTsInNodeModules` opts in by
  // forcing the synthetic single-file project fallback below, which does
  // list the file as an explicit root.
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

      // Built synchronously here since `program` is only backed by this
      // call's temporary snapshot and is invalidated once this callback
      // returns.
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
          // perFileDiagnostics is about apiFileName; the real fileName is
          // what should reach the user.
          fileName,
        ),
      );

      // Deferred to the compilation's processAssets hook (see
      // reportPendingTypeScriptDiagnostics in index.ts) so we can tell
      // whether webpack already recorded its own error for this module
      // (e.g. a "Module parse failed") and avoid double-counting.
      instance.pendingDiagnostics.set(instance.filePathKeyMapper(fileName), {
        fileName,
        errors,
      });

      // A dependant's diagnostics can change without its own module
      // rebuilding (e.g. a transitive dependency's signature change) -
      // webpack has no reason to re-invoke ts-loader for it, so recheck
      // explicitly, matching classic ts-loader's afterCompile re-check.
      // Only meaningful against the primary project: a synthetic one-off
      // project (see ensureSyntheticConfigForFile) uses the wrong compiler
      // options and import graph for any file other than the one it exists
      // for.
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
        // Scans the whole project, not just `fileName`, since some files
        // (e.g. a plain .js file pulled in via `allowJs`) never pass
        // through ts-loader's own webpack rule - matching classic
        // ts-loader's provideDeclarationFilesToWebpack.
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

  // transpileModule is program-less, so its diagnostics need a text-based
  // location lookup (see getDiagnosticLocations) rather than a Program.
  // Diagnostics echo back whatever spelling of `fileName` was passed in
  // above, so the key must match exactly (`transpileFileName`, not
  // `apiFileName`).
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
        program,
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

  // isolatedDeclarations makes single-file declaration emission sound
  // without a checker; transpileDeclaration is the only way transpileOnly
  // can produce .d.ts output at all, since the full, type-checked
  // program.getDeclarationEmit path (recordProjectDeclarationFiles) needs a
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
 * Emits a single file's declaration output via `api.transpileDeclaration`,
 * for transpileOnly + `isolatedDeclarations` projects - see the call site in
 * getTranspileOnlyEmit. Unlike `program.getDeclarationEmit`, this returns
 * raw text rather than a named output file, so the output path is computed
 * here.
 *
 * Emitted directly via `loaderContext.emitFile` rather than
 * `instance.pendingDeclarationFiles`, since transpileOnly instances never
 * register addPostCompileHooks (which flushes that map) - their
 * diagnostics are already reported immediately rather than deferred.
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
 * `program.getDeclarationEmit` does - but only when both are explicitly
 * set, since an unset `rootDir` is normally inferred by TypeScript from the
 * full set of a project's root files, which a single-file transform can't
 * replicate. Falls back to sitting beside the source otherwise.
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
  // `invalidateAll` forces a full rescan: ts-loader only learns about the
  // one file webpack is currently asking it to compile, not whether other
  // project files (e.g. a dependency) changed on disk since the last
  // snapshot - which happens on every watch-mode rebuild.
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
 * (which may fall back to a per-file synthetic project) and
 * `getTranspileOnlyEmit`.
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

  // A tsconfig that fails to parse at all is a hard failure classic
  // ts-loader surfaces directly - falling back to a synthetic config below
  // would silently paper over it by explicitly listing `fileName`. Sticking
  // with the (broken) primary project here lets the caller's config-parsing
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
  // Stored under the comparable (forward-slash) form so the `readFile`
  // override in createTypeScriptApiInstance finds it regardless of path
  // spelling. `syntheticConfigFiles`/`syntheticConfigPath` themselves stay
  // OS-native - used only as opaque identifiers for later `getProject`/
  // `openProjects` calls, which tolerate either separator style.
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
 * what's reported back to webpack and shown to the user.
 *
 * A file with an extension TypeScript doesn't recognize (e.g. a Vue SFC's
 * `<script>` block, extracted by vue-loader before we see it) has no
 * inferrable ScriptKind, and unlike classic ts-loader's `ts.LanguageService`
 * (which defaults to TS) this API panics outright. There's no host-level way
 * to specify ScriptKind directly, so alias to a virtual `.ts`-suffixed name
 * instead, served via the same `readFile` override as the synthetic config.
 * Appending (not replacing) the extension keeps the file in its real
 * directory so relative imports still resolve. A no-op for any recognized
 * extension.
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
    registerResolvedImportDependencies(program, apiFileName, addDependency);
  }

  for (const fileName of program.getConfigFileNames()) {
    if (isWebpack5) {
      loaderContext.addBuildDependency(fileName);
    } else {
      loaderContext.addDependency(fileName);
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
 * A `"<file>@<version>"` tag that changes whenever `dependencyFileName`'s
 * content genuinely changes, for use in `buildMeta.tsLoaderDefinitionFileVersions`.
 * Falls back to hashing the program's view of the file when it has no
 * tracked version in `instance.files` (e.g. an ambient .d.ts never
 * `require`d/`import`ed by anything, so never passed through ts-loader's
 * own loader).
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
 * Makes `fileName` dependent on other project source files it actually
 * imports via a relative specifier (e.g. `./dep1`), matching classic
 * ts-loader's dependency-graph tracking. Bare/absolute specifiers are left
 * alone: webpack's own module graph already tracks genuinely bundled ones,
 * and an unresolved specifier shouldn't force a rebuild on some unrelated
 * file's change (see the aliasResolution test).
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
 * specifier (e.g. `./dep1`) - see registerResolvedImportDependencies for
 * why bare/unresolved specifiers are excluded.
 */
function getDirectResolvedImports(
  program: TypeScriptProgram,
  fileName: string,
): string[] {
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    return [];
  }

  // Source file names are always forward-slash-normalized internally, but
  // resolveRelativeSpecifier below builds its candidate via Node's `path`
  // module, which is OS-native (backslash-separated on Windows). Compared
  // via toComparablePath for membership only - the candidate path actually
  // returned stays OS-native, matching every other identifier this file
  // threads through.
  const comparableSourceFileNames = new Set(
    program.getSourceFileNames().map(toComparablePath),
  );
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
 * via breadth-first search over each file's direct resolved imports (see
 * getDirectResolvedImports).
 */
function findTransitiveDependants(
  program: TypeScriptProgram,
  changedFileName: string,
  projectFileNames: readonly string[],
): Set<string> {
  // `projectFileNames` is already forward-slash-normalized; getDirectResolvedImports
  // returns OS-native paths, so both sides need normalizing before comparison
  // - otherwise a multi-hop dependant (e.g. `app.ts` -> `dep.ts` ->
  // `deeperDep.ts`) would never match on the second hop on Windows.
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
 * Reports diagnostics gathered from non-transpileOnly compiles, deferred
 * until webpack has finished building every module in this compilation -
 * mirroring classic ts-loader's afterCompile-based reporting. A module only
 * gets its own error attached if webpack hasn't already recorded one for it
 * (avoiding double-counting), but the diagnostic is always pushed onto
 * `compilation.errors` either way.
 *
 * `instance.pendingDiagnostics` is never cleared after reporting: each
 * entry is only overwritten when its file is recompiled (see
 * getTypeScriptEmit), so errors keep being re-reported until the file is
 * actually fixed - matching classic ts-loader's `filesWithErrors` re-check.
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
 * gathered from full compiles as webpack assets, matching classic
 * ts-loader's `addDeclarationFilesAsAsset`. Like
 * `reportPendingTypeScriptDiagnostics`, `instance.pendingDeclarationFiles`
 * is never cleared - each entry persists until its source file recompiles,
 * so assets aren't lost on a rebuild that doesn't touch that file.
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
  diagnostic: TypeScriptDiagnostic,
  program: DiagnosticLocationSource,
  context: string,
  module: webpack.Module | undefined,
  fallbackFile = '',
  // Set only when `diagnostic` was fetched using a synthetic, API-facing
  // file identity (see toApiFacingFileName) rather than the file's real
  // path. `getDiagnosticLocations` below still needs the original
  // `diagnostic.fileName` to resolve a location via `program`, but the path
  // shown to the user should be the real one.
  displayFileName?: string,
) {
  // `fallbackFile` is only passed for config-file-parsing/whole-program
  // diagnostics, which classic ts-loader treats as having no file of their
  // own. TypeScript 7 does attach a `fileName`/position to these (pointing
  // into tsconfig.json) where classic's compiler doesn't - deliberately
  // ignored here to match classic's output exactly.
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
 * `pos`/`end` offsets into a line/character: either a real `Program`, or
 * `makeSingleFileLocationSource`'s text-backed stand-in for
 * `transpileModule`/`transpileDeclaration` diagnostics, which have no
 * program at all.
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
 * line/character directly rather than via a `Program` - used by
 * `transpileModule`/`transpileDeclaration` diagnostics, which never have a
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
