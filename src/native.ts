import type * as webpack from 'webpack';

import * as constants from './constants';
import type {
  LoaderOptions,
  NativeApi,
  NativeDiagnostic,
  NativeEmitOutput,
  NativeInstance,
  NativeProgram,
  NativeSnapshot,
  NativeSourceFile,
  TSInstance,
} from './interfaces';
import { addErrorToModule, isWebpack5 } from './loaderUtils';
import { makeError } from './utils';

type NativeApiModule = {
  API: new () => NativeApi;
};

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
    openedProject: false,
  };
}

export function getNativeTranspilationEmit(
  fileName: string,
  contents: string,
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>
) {
  const nativeInstance = instance.nativeInstance!;
  const snapshot = updateSnapshot(nativeInstance);
  let outputText: string | undefined;
  let sourceMapText: string | undefined;

  nativeInstance.api.runWithTemporaryFileUpdate(
    snapshot,
    fileName,
    contents,
    temporarySnapshot => {
      const project = temporarySnapshot.getProject(nativeInstance.configFilePath);

      if (!project) {
        throw new Error(
          `Native TypeScript mode could not resolve project for ${fileName}.`
        );
      }

      const program = project.program;
      const emitResult = program.getJavaScriptEmit([fileName]);
      const diagnostics = dedupeDiagnostics([
        ...emitResult.diagnostics,
        ...program.getProgramDiagnostics(),
        ...program.getGlobalDiagnostics(),
        ...program.getConfigFileParsingDiagnostics(),
      ]);

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

function updateSnapshot(nativeInstance: NativeInstance) {
  const previousSnapshot = nativeInstance.snapshot;
  const snapshot = nativeInstance.api.updateSnapshot(
    nativeInstance.openedProject
      ? undefined
      : { openProjects: [nativeInstance.configFilePath] }
  );

  nativeInstance.snapshot = snapshot;
  nativeInstance.openedProject = true;
  previousSnapshot?.dispose?.();

  return snapshot;
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

  diagnostics.forEach(diagnostic => {
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
