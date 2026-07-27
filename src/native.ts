import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as webpack from 'webpack';
import type { APIOptions } from 'typescript/unstable/sync';

import * as constants from './constants';
import type {
  LoaderOptions,
  NativeApi,
  NativeDiagnostic,
  NativeEmitOutput,
  NativeInstance,
  NativeProgram,
  TSInstance,
} from './types';
import { addErrorToModule, isWebpack5, makeError } from './loaderUtils';

type NativeApiModule = {
  API: new (options?: APIOptions) => NativeApi;
};

// eslint-disable-next-line @typescript-eslint/no-implied-eval -- preserve native dynamic import for the ESM-only API entrypoint
const dynamicImport = new Function(
  'specifier',
  'return import(specifier)'
) as (specifier: string) => Promise<NativeApiModule>;

const nativeApiModulePromises = new Map<string, Promise<NativeApiModule>>();

export async function createNativeInstance(
  loaderOptions: LoaderOptions,
  configFilePath: string
): Promise<NativeInstance> {
  const nativeApiModule = await loadNativeApiModule(loaderOptions.compiler);

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
      const diagnostics = dedupeDiagnostics(emitResult.diagnostics);

      ({ outputText, sourceMapText } =
        getOutputAndSourceMapFromNativeEmit(emitResult));

      registerNativeDependencies(loaderContext, program);
      reportNativeDiagnostics(instance, loaderContext, diagnostics, program);
    }
  );

  return { outputText, sourceMapText };
}

async function loadNativeApiModule(compilerPackage: string) {
  const specifier = `${compilerPackage}/unstable/sync`;
  let promise = nativeApiModulePromises.get(specifier);

  if (!promise) {
    promise = dynamicImport(specifier).catch((error: unknown) => {
      nativeApiModulePromises.delete(specifier);
      throw new Error(
        `Could not load TypeScript native API from "${specifier}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
    nativeApiModulePromises.set(specifier, promise);
  }

  return promise;
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
      const error = makeError(
        instance.loaderOptions,
        formatNativeDiagnostic(diagnostic, program),
        diagnostic.fileName ?? ''
      );

      if (module) {
        addErrorToModule(module, error);
      } else {
        loaderContext.emitError(error);
      }
    });
}

function formatNativeDiagnostic(
  diagnostic: NativeDiagnostic,
  program: NativeProgram
) {
  if (!diagnostic.fileName) {
    return `TS${diagnostic.code}: ${diagnostic.text}`;
  }

  const sourceFile = program.getSourceFile(diagnostic.fileName);
  const location =
    sourceFile &&
    diagnostic.pos >= 0 &&
    sourceFile.getLineAndCharacterOfPosition(diagnostic.pos);

  return `${diagnostic.fileName}${
    location
      ? `(${location.line + 1},${location.character + 1})`
      : ''
  }: TS${diagnostic.code}: ${diagnostic.text}`;
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
