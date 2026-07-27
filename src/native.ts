import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Chalk } from 'chalk';
import type * as webpack from 'webpack';
import type { APIOptions } from 'typescript/unstable/sync';

import * as constants from './constants';
import type {
  ErrorInfo,
  FileLocation,
  LoaderOptions,
  NativeApi,
  NativeDiagnostic,
  NativeEmitOutput,
  NativeInstance,
  NativeProgram,
  Severity,
  TSInstance,
} from './types';
import { addErrorToModule, isWebpack5, makeError } from './loaderUtils';

/** Indexed by TypeScript's DiagnosticCategory: Warning, Error, Suggestion, Message */
const diagnosticCategoryNames = [
  'warning',
  'error',
  'suggestion',
  'message',
] as const;

type NativeApiModule = {
  API: new (options?: APIOptions) => NativeApi;
};

export function createNativeInstance(
  loaderOptions: LoaderOptions,
  configFilePath: string
): NativeInstance {
  const nativeApiModule = loadNativeApiModule(loaderOptions.compiler);

  return {
    api: new nativeApiModule.API(),
    configFilePath,
    syntheticConfigFiles: new Map(),
    openedProjectPaths: new Set(),
  };
}

export function getNativeEmit(
  fileName: string,
  contents: string,
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>
) {
  const nativeInstance = instance.nativeInstance;
  const { snapshot, projectConfigPath } = prepareSnapshotForFile(
    nativeInstance,
    fileName
  );
  let outputText: string | undefined;
  let sourceMapText: string | undefined;

  nativeInstance.api.runWithTemporaryFileUpdate(
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
          `Native TypeScript mode could not resolve project for ${fileName}.`
        );
      }

      const program = project.program;
      const emitResult = program.getJavaScriptEmit([fileName]);
      const diagnostics = dedupeDiagnostics([
        ...emitResult.diagnostics,
        ...program.getSyntacticDiagnostics(fileName),
        // Type-checking is skipped entirely in transpileOnly mode, matching
        // classic ts-loader's transpileModule-based behaviour.
        ...(instance.loaderOptions.transpileOnly
          ? []
          : program.getSemanticDiagnostics(fileName)),
      ]);

      ({ outputText, sourceMapText } =
        getOutputAndSourceMapFromNativeEmit(emitResult));

      registerNativeDependencies(loaderContext, program);
      reportNativeDiagnostics(instance, loaderContext, diagnostics, program);
    }
  );

  return { outputText, sourceMapText };
}

function loadNativeApiModule(compilerPackage: string): NativeApiModule {
  const specifier = `${compilerPackage}/unstable/sync`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- ESM-only entrypoint, loadable via Node's require(esm) support (Node >= 22.12)
    return require(specifier) as NativeApiModule;
  } catch (error) {
    throw new Error(
      `Could not load TypeScript native API from "${specifier}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function updateSnapshot(
  nativeInstance: NativeInstance,
  fileName: string,
  openProjects?: string[]
) {
  const previousSnapshot = nativeInstance.snapshot;
  const snapshot = nativeInstance.api.updateSnapshot(
    openProjects && openProjects.length > 0
      ? { openProjects, openFiles: [fileName] }
      : { openFiles: [fileName] }
  );

  nativeInstance.snapshot = snapshot;
  openProjects?.forEach(projectPath =>
    nativeInstance.openedProjectPaths.add(projectPath)
  );
  previousSnapshot?.dispose?.();

  return snapshot;
}

function prepareSnapshotForFile(nativeInstance: NativeInstance, fileName: string) {
  const primaryProjectPath = nativeInstance.configFilePath;
  const snapshot = updateSnapshot(
    nativeInstance,
    fileName,
    nativeInstance.openedProjectPaths.has(primaryProjectPath)
      ? undefined
      : [primaryProjectPath]
  );
  const primaryProject = snapshot.getProject(primaryProjectPath);

  if (primaryProject?.program.getSourceFile(fileName)) {
    return { snapshot, projectConfigPath: primaryProjectPath };
  }

  const syntheticConfigPath = ensureSyntheticConfigForFile(
    nativeInstance,
    primaryProjectPath,
    primaryProject?.parsedCommandLine.fileNames ?? [],
    fileName
  );
  const syntheticSnapshot = updateSnapshot(
    nativeInstance,
    fileName,
    nativeInstance.openedProjectPaths.has(syntheticConfigPath)
      ? undefined
      : [syntheticConfigPath]
  );

  return { snapshot: syntheticSnapshot, projectConfigPath: syntheticConfigPath };
}

function ensureSyntheticConfigForFile(
  nativeInstance: NativeInstance,
  configFilePath: string,
  rootFiles: readonly string[],
  fileName: string
) {
  const existing = nativeInstance.syntheticConfigFiles.get(fileName);
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
  nativeInstance.syntheticConfigFiles.set(fileName, syntheticConfigPath);
  return syntheticConfigPath;
}

function hashFileName(fileName: string) {
  return crypto.createHash('sha1').update(fileName).digest('hex').slice(0, 12);
}

function getOutputAndSourceMapFromNativeEmit(emitResult: NativeEmitOutput) {
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

function registerNativeDependencies(
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  program: NativeProgram
) {
  loaderContext.clearDependencies();

  for (const fileName of program.getSourceFileNames()) {
    const sourceFile = program.getSourceFile(fileName);

    if (
      sourceFile &&
      !program.isSourceFileDefaultLibrary(sourceFile) &&
      !program.isSourceFileFromExternalLibrary(sourceFile)
    ) {
      loaderContext.addDependency(fileName);
    }
  }

  for (const fileName of program.getConfigFileNames()) {
    if (isWebpack5) {
      loaderContext.addBuildDependency(fileName);
    } else {
      loaderContext.addDependency(fileName);
    }
  }
}

function reportNativeDiagnostics(
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  diagnostics: readonly NativeDiagnostic[],
  program: NativeProgram
) {
  if (diagnostics.length === 0) {
    return;
  }

  const module = loaderContext._module;

  diagnostics
    .filter(
      diagnostic =>
        instance.loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) === -1
    )
    .forEach(diagnostic => {
      const { start, end } = getDiagnosticLocations(diagnostic, program);
      const errorInfo: ErrorInfo = {
        code: diagnostic.code,
        severity: (diagnosticCategoryNames[diagnostic.category] ??
          'error') as Severity,
        content: diagnostic.text,
        file: diagnostic.fileName ? path.normalize(diagnostic.fileName) : '',
        line: start === undefined ? 0 : start.line,
        character: start === undefined ? 0 : start.character,
        context: loaderContext.context,
      };

      const message =
        instance.loaderOptions.errorFormatter === undefined
          ? defaultErrorFormatter(errorInfo, instance.colors)
          : instance.loaderOptions.errorFormatter(errorInfo, instance.colors);

      const error = makeError(
        instance.loaderOptions,
        message,
        errorInfo.file,
        start,
        end
      );

      if (module) {
        addErrorToModule(module, error);
      } else {
        loaderContext.emitError(error);
      }
    });
}

function getDiagnosticLocations(
  diagnostic: NativeDiagnostic,
  program: NativeProgram
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

function dedupeDiagnostics(diagnostics: readonly NativeDiagnostic[]) {
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
