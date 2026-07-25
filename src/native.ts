import * as fs from 'fs';
import * as path from 'path';
import type * as webpack from 'webpack';

import * as constants from './constants';
import type {
  ErrorInfo,
  LoaderOptions,
  NativeApi,
  NativeDiagnostic,
  NativeEmitOutput,
  NativeInstance,
  NativeProgram,
  TSInstance,
} from './interfaces';
import { addErrorToModule, isWebpack5 } from './loaderUtils';
import { makeError } from './utils';

type NativeApiModule = {
  API: new () => NativeApi;
  DiagnosticCategory?: Record<number, string>;
};

export function resolveConfigFilePath(
  resourcePath: string,
  configFile: string
): string | undefined {
  if (path.isAbsolute(configFile)) {
    return fs.existsSync(configFile) ? configFile : undefined;
  }

  let requestDirPath = path.dirname(resourcePath);
  if (configFile.match(/^\.\.?(\/|\\)/) !== null) {
    const resolvedPath = path.resolve(requestDirPath, configFile);
    return fs.existsSync(resolvedPath) ? resolvedPath : undefined;
  }

  while (true) {
    const fileName = path.join(requestDirPath, configFile);
    if (fs.existsSync(fileName)) {
      return fileName;
    }
    const parentPath = path.dirname(requestDirPath);
    if (parentPath === requestDirPath) {
      break;
    }
    requestDirPath = parentPath;
  }

  return undefined;
}

export function createNativeInstance(
  loaderOptions: LoaderOptions,
  configFilePath: string
): NativeInstance {
  const nativeApiModule = requireNativeApi(loaderOptions.compiler);
  const api = new nativeApiModule.API();
  return {
    api,
    configFilePath,
    openedProject: false,
    declarationOutputs: new Map(),
    diagnosticCategory: nativeApiModule.DiagnosticCategory,
  };
}

export function getNativeTranspilationEmit(
  fileName: string,
  contents: string,
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>
) {
  const nativeInstance = instance.nativeInstance!;
  const snapshot = updateSnapshot(nativeInstance, fileName);
  let outputText: string | undefined;
  let sourceMapText: string | undefined;

  nativeInstance.api.runWithTemporaryFileUpdate(
    snapshot,
    fileName,
    contents,
    temporarySnapshot => {
      const project =
        temporarySnapshot.getDefaultProjectForFile(fileName) ??
        temporarySnapshot.getProject(nativeInstance.configFilePath);
      if (!project) {
        throw new Error(
          `Native TypeScript mode could not resolve project for ${fileName}.`
        );
      }
      const program = project.program;
      const emitResult = program.getJavaScriptEmit([fileName]);
      const declarationEmitResult = shouldEmitDeclarations(project)
        ? program.getDeclarationEmit([fileName])
        : undefined;

      const diagnostics = dedupeDiagnostics([
        ...emitResult.diagnostics,
        ...(declarationEmitResult?.diagnostics ?? []),
        ...program.getProgramDiagnostics(),
        ...program.getGlobalDiagnostics(),
        ...program.getConfigFileParsingDiagnostics(),
      ]);

      const output = getOutputAndSourceMapFromNativeEmit(emitResult);
      outputText = output.outputText;
      sourceMapText = output.sourceMapText;
      registerNativeDependencies(loaderContext, fileName, nativeInstance, program);
      updateDeclarationOutputs(nativeInstance, declarationEmitResult);
      reportNativeDiagnostics(instance, loaderContext, diagnostics, program);
    }
  );

  return { outputText, sourceMapText };
}

export function emitNativeDeclarationFiles(
  instance: TSInstance,
  compilation: webpack.Compilation
) {
  const nativeInstance = instance.nativeInstance;
  if (!nativeInstance) {
    return;
  }
  for (const outputFile of nativeInstance.declarationOutputs.values()) {
    const assetPath = path
      .relative(compilation.compiler.outputPath, outputFile.name)
      .replace(/\\/g, '/');
    if (isWebpack5) {
      compilation.emitAsset(
        assetPath,
        new (require('webpack').sources.RawSource)(outputFile.text)
      );
    } else {
      (compilation as any).assets[assetPath] = {
        source: () => outputFile.text,
        size: () => Buffer.byteLength(outputFile.text, 'utf8'),
      };
    }
  }
}

function requireNativeApi(compilerPackageName: string): NativeApiModule {
  try {
    return require(`${compilerPackageName}/unstable/sync`) as NativeApiModule;
  } catch (_error) {
    // eslint-disable-next-line preserve-caught-error
    throw new Error(
      `experimentalNativeApi requires a TypeScript 7 native package with "${compilerPackageName}/unstable/sync" available.`
    );
  }
}

function updateSnapshot(nativeInstance: NativeInstance, fileName: string) {
  nativeInstance.snapshot?.dispose?.();
  nativeInstance.snapshot = nativeInstance.api.updateSnapshot({
    openProjects: nativeInstance.openedProject
      ? undefined
      : [nativeInstance.configFilePath],
    openFiles: [fileName],
    fileChanges: { changed: [fileName] },
  });
  nativeInstance.openedProject = true;
  return nativeInstance.snapshot;
}

function registerNativeDependencies(
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  fileName: string,
  nativeInstance: NativeInstance,
  program: NativeProgram
) {
  loaderContext.clearDependencies();
  loaderContext.addDependency(path.resolve(fileName));
  loaderContext.addDependency(path.resolve(nativeInstance.configFilePath));
  if (typeof (loaderContext as any).addBuildDependency === 'function') {
    (loaderContext as any).addBuildDependency(nativeInstance.configFilePath);
  }

  for (const configFile of program.getConfigFileNames()) {
    const resolvedConfigFile = path.resolve(configFile);
    loaderContext.addDependency(resolvedConfigFile);
    if (typeof (loaderContext as any).addBuildDependency === 'function') {
      (loaderContext as any).addBuildDependency(resolvedConfigFile);
    }
  }

  for (const sourceFileName of program.getSourceFileNames()) {
    const sourceFile = program.getSourceFile(sourceFileName);
    if (
      !sourceFile ||
      program.isSourceFileDefaultLibrary(sourceFile) ||
      program.isSourceFileFromExternalLibrary(sourceFile)
    ) {
      continue;
    }
    loaderContext.addDependency(path.resolve(sourceFileName));
  }
}

function updateDeclarationOutputs(
  nativeInstance: NativeInstance,
  declarationEmitResult: NativeEmitOutput | undefined
) {
  if (!declarationEmitResult) {
    return;
  }

  for (const [name, outputFile] of declarationEmitResult.outputFiles.entries()) {
    if (!name.match(constants.dtsDtsxOrDtsDtsxMapRegex)) {
      continue;
    }
    nativeInstance.declarationOutputs.set(name, { name, text: outputFile.text });
  }
}

function shouldEmitDeclarations(project: {
  parsedCommandLine?: { options?: Record<string, unknown> };
}) {
  const options = project.parsedCommandLine?.options;
  return !!(
    options?.declaration ||
    options?.composite ||
    options?.emitDeclarationOnly ||
    options?.declarationMap
  );
}

function reportNativeDiagnostics(
  instance: TSInstance,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  diagnostics: NativeDiagnostic[],
  program: NativeProgram
) {
  if (instance.loaderOptions.happyPackMode) {
    return;
  }
  const module = loaderContext._module;
  const errors = diagnostics
    .filter(
      diagnostic =>
        instance.loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) === -1
    )
    .map(diagnostic => {
      const sourceFile =
        diagnostic.fileName && program.getSourceFile(diagnostic.fileName);
      const start =
        sourceFile && diagnostic.pos >= 0
          ? sourceFile.getLineAndCharacterOfPosition(diagnostic.pos)
          : undefined;
      const end =
        sourceFile && diagnostic.end >= diagnostic.pos
          ? sourceFile.getLineAndCharacterOfPosition(diagnostic.end)
          : undefined;
      const severity = getSeverity(instance.nativeInstance, diagnostic.category);
      const normalizedFile = diagnostic.fileName
        ? path.normalize(diagnostic.fileName)
        : '';
      const errorInfo: ErrorInfo = {
        code: diagnostic.code,
        severity,
        content: diagnostic.text,
        file: normalizedFile,
        line: start ? start.line + 1 : 0,
        character: start ? start.character + 1 : 0,
        context: loaderContext.context,
      };
      const message = instance.loaderOptions.errorFormatter
        ? instance.loaderOptions.errorFormatter(errorInfo, instance.colors)
        : `[tsl] ${severity.toUpperCase()} in ${normalizedFile}(${
            errorInfo.line
          },${errorInfo.character})${constants.EOL}      TS${
            diagnostic.code
          }: ${diagnostic.text}`;
      return makeError(
        instance.loaderOptions,
        message,
        normalizedFile,
        start
          ? { line: start.line + 1, character: start.character + 1 }
          : undefined,
        end ? { line: end.line + 1, character: end.character + 1 } : undefined
      );
    });

  for (const error of errors) {
    if (module) {
      addErrorToModule(module, error);
    }
  }
}

function getSeverity(
  nativeInstance: NativeInstance | undefined,
  category: number
): 'error' | 'warning' {
  const label = nativeInstance?.diagnosticCategory?.[category]?.toLowerCase();
  return label === 'warning' ? 'warning' : 'error';
}

function dedupeDiagnostics(diagnostics: NativeDiagnostic[]) {
  const seen = new Set<string>();
  const deduped: NativeDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnostic.category}:${
      diagnostic.fileName ?? ''
    }:${diagnostic.pos}:${diagnostic.end}:${diagnostic.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(diagnostic);
    }
  }
  return deduped;
}

function getOutputAndSourceMapFromNativeEmit(output: NativeEmitOutput) {
  let outputText: string | undefined;
  let sourceMapText: string | undefined;

  for (const [name, file] of output.outputFiles.entries()) {
    if (name.match(constants.jsJsx)) {
      outputText = file.text;
    } else if (name.match(constants.jsJsxMap)) {
      sourceMapText = file.text;
    }
  }

  return { outputText, sourceMapText };
}
