import * as path from 'path';
import * as typescript from 'typescript';
import * as webpack from 'webpack';

import { getParsedCommandLine } from './config';
import * as constants from './constants';
import {
  CustomResolveModuleName,
  CustomResolveTypeReferenceDirective,
  FormatDiagnosticsHost,
  ModuleResolutionHost,
  ResolvedModule,
  ResolveSync,
  TSInstance,
  WatchHost
} from './interfaces';
import * as logger from './logger';
import { makeResolver } from './resolver';
import { readFile, unorderedRemoveItem } from './utils';

export type Action = () => void;

export interface ServiceHostWhichMayBeCacheable {
  servicesHost: typescript.LanguageServiceHost;
  clearCache: Action | null;
}

/**
 * Create the TypeScript language service
 */
export function makeServicesHost(
  scriptRegex: RegExp,
  log: logger.Logger,
  loader: webpack.loader.LoaderContext,
  instance: TSInstance,
  enableFileCaching: boolean,
  projectReferences?: ReadonlyArray<typescript.ProjectReference>
): ServiceHostWhichMayBeCacheable {
  const {
    compiler,
    compilerOptions,
    appendTsTsxSuffixesIfRequired,
    files,
    loaderOptions: {
      resolveModuleName: customResolveModuleName,
      resolveTypeReferenceDirective: customResolveTypeReferenceDirective
    }
  } = instance;

  const newLine =
    compilerOptions.newLine === constants.CarriageReturnLineFeedCode
      ? constants.CarriageReturnLineFeed
      : compilerOptions.newLine === constants.LineFeedCode
      ? constants.LineFeed
      : constants.EOL;

  // make a (sync) resolver that follows webpack's rules
  const resolveSync = makeResolver(loader._compiler.options);

  const readFileWithFallback = (
    filePath: string,
    encoding?: string | undefined
  ): string | undefined =>
    compiler.sys.readFile(filePath, encoding) || readFile(filePath, encoding);

  const fileExists = (filePathToCheck: string) =>
    compiler.sys.fileExists(filePathToCheck) ||
    readFile(filePathToCheck) !== undefined;

  const moduleResolutionHost: ModuleResolutionHost = {
    fileExists,
    readFile: readFileWithFallback,
    realpath: compiler.sys.realpath,
    directoryExists: compiler.sys.directoryExists,
    getCurrentDirectory: compiler.sys.getCurrentDirectory,
    getDirectories: compiler.sys.getDirectories
  };

  const clearCache = enableFileCaching ? addCache(moduleResolutionHost) : null;

  // loader.context seems to work fine on Linux / Mac regardless causes problems for @types resolution on Windows for TypeScript < 2.3
  const getCurrentDirectory = () => loader.context;

  const resolvers = makeResolvers(
    compiler,
    compilerOptions,
    moduleResolutionHost,
    customResolveTypeReferenceDirective,
    customResolveModuleName,
    resolveSync,
    appendTsTsxSuffixesIfRequired,
    scriptRegex,
    instance
  );

  const servicesHost: typescript.LanguageServiceHost = {
    getProjectVersion: () => `${instance.version}`,

    getProjectReferences: () => projectReferences,

    getScriptFileNames: () =>
      [...files.keys()].filter(filePath => filePath.match(scriptRegex)),

    getScriptVersion: (fileName: string) => {
      fileName = path.normalize(fileName);
      const file = files.get(fileName);
      return file === undefined ? '' : file.version.toString();
    },

    getScriptSnapshot: (fileName: string) => {
      // This is called any time TypeScript needs a file's text
      // We either load from memory or from disk
      fileName = path.normalize(fileName);
      let file = files.get(fileName);

      if (file === undefined) {
        const text = readFile(fileName);
        if (text === undefined) {
          return undefined;
        }

        file = { version: 0, text };
        files.set(fileName, file);
      }

      return compiler.ScriptSnapshot.fromString(file.text!);
    },

    /**
     * getDirectories is also required for full import and type reference completions.
     * Without it defined, certain completions will not be provided
     */
    getDirectories: compiler.sys.getDirectories,

    /**
     * For @types expansion, these two functions are needed.
     */
    directoryExists: moduleResolutionHost.directoryExists,

    useCaseSensitiveFileNames: () => compiler.sys.useCaseSensitiveFileNames,

    realpath: moduleResolutionHost.realpath,

    // The following three methods are necessary for @types resolution from TS 2.4.1 onwards see: https://github.com/Microsoft/TypeScript/issues/16772
    fileExists: moduleResolutionHost.fileExists,
    readFile: moduleResolutionHost.readFile,
    readDirectory: compiler.sys.readDirectory,

    getCurrentDirectory,

    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options: typescript.CompilerOptions) =>
      compiler.getDefaultLibFilePath(options),
    getNewLine: () => newLine,
    trace: log.log,
    log: log.log,

    // used for (/// <reference types="...">) see https://github.com/Realytics/fork-ts-checker-webpack-plugin/pull/250#issuecomment-485061329
    resolveTypeReferenceDirectives: resolvers.resolveTypeReferenceDirectives,

    resolveModuleNames: resolvers.resolveModuleNames,

    getCustomTransformers: () => instance.transformers
  };

  return { servicesHost, clearCache };
}

function makeResolvers(
  compiler: typeof typescript,
  compilerOptions: typescript.CompilerOptions,
  moduleResolutionHost: typescript.ModuleResolutionHost,
  customResolveTypeReferenceDirective: CustomResolveTypeReferenceDirective,
  customResolveModuleName: CustomResolveModuleName,
  resolveSync: ResolveSync,
  appendTsTsxSuffixesIfRequired: (filePath: string) => string,
  scriptRegex: RegExp,
  instance: TSInstance
) {
  const resolveTypeReferenceDirective = makeResolveTypeReferenceDirective(
    compiler,
    compilerOptions,
    moduleResolutionHost,
    customResolveTypeReferenceDirective
  );

  const resolveTypeReferenceDirectives = (
    typeDirectiveNames: string[],
    containingFile: string,
    _redirectedReference?: typescript.ResolvedProjectReference
  ): (typescript.ResolvedTypeReferenceDirective | undefined)[] =>
    typeDirectiveNames.map(
      directive =>
        resolveTypeReferenceDirective(
          directive,
          containingFile,
          _redirectedReference
        ).resolvedTypeReferenceDirective
    );

  const resolveModuleName = makeResolveModuleName(
    compiler,
    compilerOptions,
    moduleResolutionHost,
    customResolveModuleName
  );

  const resolveModuleNames = (
    moduleNames: string[],
    containingFile: string,
    _reusedNames?: string[] | undefined,
    _redirectedReference?: typescript.ResolvedProjectReference | undefined
  ): (typescript.ResolvedModule | undefined)[] => {
    const resolvedModules = moduleNames.map(moduleName =>
      resolveModule(
        resolveSync,
        resolveModuleName,
        appendTsTsxSuffixesIfRequired,
        scriptRegex,
        moduleName,
        containingFile
      )
    );

    populateDependencyGraphs(resolvedModules, instance, containingFile);

    return resolvedModules;
  };

  return {
    resolveTypeReferenceDirectives,
    resolveModuleNames
  };
}

/**
 * Create the TypeScript Watch host
 */
export function makeWatchHost(
  scriptRegex: RegExp,
  log: logger.Logger,
  loader: webpack.loader.LoaderContext,
  instance: TSInstance,
  projectReferences?: ReadonlyArray<typescript.ProjectReference>
) {
  const {
    compiler,
    compilerOptions,
    appendTsTsxSuffixesIfRequired,
    files,
    otherFiles,
    loaderOptions: {
      resolveModuleName: customResolveModuleName,
      resolveTypeReferenceDirective: customResolveTypeReferenceDirective
    }
  } = instance;

  const newLine =
    compilerOptions.newLine === constants.CarriageReturnLineFeedCode
      ? constants.CarriageReturnLineFeed
      : compilerOptions.newLine === constants.LineFeedCode
      ? constants.LineFeed
      : constants.EOL;

  // make a (sync) resolver that follows webpack's rules
  const resolveSync = makeResolver(loader._compiler.options);

  const readFileWithFallback = (
    filePath: string,
    encoding?: string | undefined
  ): string | undefined =>
    compiler.sys.readFile(filePath, encoding) || readFile(filePath, encoding);

  const moduleResolutionHost: ModuleResolutionHost = {
    fileExists,
    readFile: readFileWithFallback,
    realpath: compiler.sys.realpath
  };

  // loader.context seems to work fine on Linux / Mac regardless causes problems for @types resolution on Windows for TypeScript < 2.3
  const getCurrentDirectory = () => loader.context;

  type WatchCallbacks<T> = { [fileName: string]: T[] | undefined };
  const watchedFiles: WatchCallbacks<typescript.FileWatcherCallback> = {};
  const watchedDirectories: WatchCallbacks<
    typescript.DirectoryWatcherCallback
  > = {};
  const watchedDirectoriesRecursive: WatchCallbacks<
    typescript.DirectoryWatcherCallback
  > = {};

  const resolvers = makeResolvers(
    compiler,
    compilerOptions,
    moduleResolutionHost,
    customResolveTypeReferenceDirective,
    customResolveModuleName,
    resolveSync,
    appendTsTsxSuffixesIfRequired,
    scriptRegex,
    instance
  );

  const watchHost: WatchHost = {
    rootFiles: getRootFileNames(),
    options: compilerOptions,

    useCaseSensitiveFileNames: () => compiler.sys.useCaseSensitiveFileNames,
    getNewLine: () => newLine,
    getCurrentDirectory,
    getDefaultLibFileName: options => compiler.getDefaultLibFilePath(options),

    fileExists,
    readFile: readFileWithCachingText,
    directoryExists: dirPath =>
      compiler.sys.directoryExists(path.normalize(dirPath)),
    getDirectories: dirPath =>
      compiler.sys.getDirectories(path.normalize(dirPath)),
    readDirectory: (dirPath, extensions, exclude, include, depth) =>
      compiler.sys.readDirectory(
        path.normalize(dirPath),
        extensions,
        exclude,
        include,
        depth
      ),
    realpath: dirPath => compiler.sys.resolvePath(path.normalize(dirPath)),
    trace: logData => log.log(logData),

    watchFile,
    watchDirectory,

    // used for (/// <reference types="...">) see https://github.com/Realytics/fork-ts-checker-webpack-plugin/pull/250#issuecomment-485061329
    resolveTypeReferenceDirectives: resolvers.resolveTypeReferenceDirectives,

    resolveModuleNames: resolvers.resolveModuleNames,

    invokeFileWatcher,
    invokeDirectoryWatcher,
    updateRootFileNames: () => {
      instance.changedFilesList = false;
      if (instance.watchOfFilesAndCompilerOptions !== undefined) {
        instance.watchOfFilesAndCompilerOptions.updateRootFileNames(
          getRootFileNames()
        );
      }
    },
    createProgram:
      projectReferences === undefined
        ? compiler.createAbstractBuilder
        : createBuilderProgramWithReferences
  };
  return watchHost;

  function getRootFileNames() {
    return [...files.keys()].filter(filePath => filePath.match(scriptRegex));
  }

  function readFileWithCachingText(fileName: string, encoding?: string) {
    fileName = path.normalize(fileName);
    const file = files.get(fileName) || otherFiles.get(fileName);
    if (file !== undefined) {
      return file.text;
    }
    const text = readFileWithFallback(fileName, encoding);
    if (text === undefined) {
      return undefined;
    }
    otherFiles.set(fileName, { version: 0, text });
    return text;
  }

  function fileExists(fileName: string) {
    const filePath = path.normalize(fileName);
    return files.has(filePath) || compiler.sys.fileExists(filePath);
  }

  function invokeWatcherCallbacks(
    callbacks: typescript.FileWatcherCallback[] | undefined,
    fileName: string,
    eventKind: typescript.FileWatcherEventKind
  ): void;
  function invokeWatcherCallbacks(
    callbacks: typescript.DirectoryWatcherCallback[] | undefined,
    fileName: string
  ): void;
  function invokeWatcherCallbacks(
    callbacks:
      | typescript.FileWatcherCallback[]
      | typescript.DirectoryWatcherCallback[]
      | undefined,
    fileName: string,
    eventKind?: typescript.FileWatcherEventKind
  ) {
    if (callbacks !== undefined) {
      // The array copy is made to ensure that even if one of the callback removes the callbacks,
      // we dont miss any callbacks following it
      const cbs = callbacks.slice();
      for (const cb of cbs) {
        cb(fileName, eventKind as typescript.FileWatcherEventKind);
      }
    }
  }

  function invokeFileWatcher(
    fileName: string,
    eventKind: typescript.FileWatcherEventKind
  ) {
    fileName = path.normalize(fileName);
    invokeWatcherCallbacks(watchedFiles[fileName], fileName, eventKind);
  }

  function invokeDirectoryWatcher(
    directory: string,
    fileAddedOrRemoved: string
  ) {
    directory = path.normalize(directory);
    invokeWatcherCallbacks(watchedDirectories[directory], fileAddedOrRemoved);
    invokeRecursiveDirectoryWatcher(directory, fileAddedOrRemoved);
  }

  function invokeRecursiveDirectoryWatcher(
    directory: string,
    fileAddedOrRemoved: string
  ) {
    directory = path.normalize(directory);
    invokeWatcherCallbacks(
      watchedDirectoriesRecursive[directory],
      fileAddedOrRemoved
    );
    const basePath = path.dirname(directory);
    if (directory !== basePath) {
      invokeRecursiveDirectoryWatcher(basePath, fileAddedOrRemoved);
    }
  }

  function createWatcher<T>(
    file: string,
    callbacks: WatchCallbacks<T>,
    callback: T
  ): typescript.FileWatcher {
    file = path.normalize(file);
    const existing = callbacks[file];
    if (existing === undefined) {
      callbacks[file] = [callback];
    } else {
      existing.push(callback);
    }
    return {
      close: () => {
        // tslint:disable-next-line:no-shadowed-variable
        const existing = callbacks[file];
        if (existing !== undefined) {
          unorderedRemoveItem(existing, callback);
        }
      }
    };
  }

  function watchFile(
    fileName: string,
    callback: typescript.FileWatcherCallback,
    _pollingInterval?: number
  ) {
    return createWatcher(fileName, watchedFiles, callback);
  }

  function watchDirectory(
    fileName: string,
    callback: typescript.DirectoryWatcherCallback,
    recursive?: boolean
  ) {
    return createWatcher(
      fileName,
      recursive === true ? watchedDirectoriesRecursive : watchedDirectories,
      callback
    );
  }

  function createBuilderProgramWithReferences(
    rootNames: ReadonlyArray<string> | undefined,
    options: typescript.CompilerOptions | undefined,
    host: typescript.CompilerHost | undefined,
    oldProgram: typescript.BuilderProgram | undefined,
    configFileParsingDiagnostics:
      | ReadonlyArray<typescript.Diagnostic>
      | undefined
  ) {
    const program = compiler.createProgram({
      rootNames: rootNames!,
      options: options!,
      host,
      oldProgram: oldProgram && oldProgram.getProgram(),
      configFileParsingDiagnostics,
      projectReferences
    });

    const builderProgramHost: typescript.BuilderProgramHost = host!;
    return compiler.createAbstractBuilder(
      program,
      builderProgramHost,
      oldProgram,
      configFileParsingDiagnostics
    );
  }
}

/**
 * Create the TypeScript Watch host
 */
export function makeSolutionBuilderHost(
  scriptRegex: RegExp,
  log: logger.Logger,
  loader: webpack.loader.LoaderContext,
  instance: TSInstance
) {
  const {
    compiler,
    compilerOptions,
    appendTsTsxSuffixesIfRequired,
    loaderOptions: {
      resolveModuleName: customResolveModuleName,
      resolveTypeReferenceDirective: customResolveTypeReferenceDirective
    }
  } = instance;

  // loader.context seems to work fine on Linux / Mac regardless causes problems for @types resolution on Windows for TypeScript < 2.3
  const getCurrentDirectory = () => loader.context;
  const formatDiagnosticHost: FormatDiagnosticsHost = {
    getCurrentDirectory: compiler.sys.getCurrentDirectory,
    getCanonicalFileName: compiler.sys.useCaseSensitiveFileNames
      ? s => s
      : s => s.toLowerCase(),
    getNewLine: () => compiler.sys.newLine
  };

  const reportDiagnostic = (d: typescript.Diagnostic) =>
    log.logError(compiler.formatDiagnostic(d, formatDiagnosticHost));
  const reportSolutionBuilderStatus = (d: typescript.Diagnostic) =>
    log.logInfo(compiler.formatDiagnostic(d, formatDiagnosticHost));
  const reportWatchStatus = (
    d: typescript.Diagnostic,
    newLine: string,
    _options: typescript.CompilerOptions
  ) =>
    log.logInfo(
      `${compiler.flattenDiagnosticMessageText(
        d.messageText,
        compiler.sys.newLine
      )}${newLine + newLine}`
    );
  const solutionBuilderHost = compiler.createSolutionBuilderWithWatchHost(
    compiler.sys,
    compiler.createEmitAndSemanticDiagnosticsBuilderProgram,
    reportDiagnostic,
    reportSolutionBuilderStatus,
    reportWatchStatus
  );
  solutionBuilderHost.getCurrentDirectory = getCurrentDirectory;
  solutionBuilderHost.trace = logData => log.logInfo(logData);
  solutionBuilderHost.getParsedCommandLine = file =>
    getParsedCommandLine(compiler, instance.loaderOptions, file);

  // make a (sync) resolver that follows webpack's rules
  const resolveSync = makeResolver(loader._compiler.options);
  const resolvers = makeResolvers(
    compiler,
    compilerOptions,
    solutionBuilderHost,
    customResolveTypeReferenceDirective,
    customResolveModuleName,
    resolveSync,
    appendTsTsxSuffixesIfRequired,
    scriptRegex,
    instance
  );
  // used for (/// <reference types="...">) see https://github.com/Realytics/fork-ts-checker-webpack-plugin/pull/250#issuecomment-485061329
  solutionBuilderHost.resolveTypeReferenceDirectives =
    resolvers.resolveTypeReferenceDirectives;
  solutionBuilderHost.resolveModuleNames = resolvers.resolveModuleNames;

  return solutionBuilderHost;
}

type ResolveTypeReferenceDirective = (
  directive: string,
  containingFile: string,
  redirectedReference?: typescript.ResolvedProjectReference
) => typescript.ResolvedTypeReferenceDirectiveWithFailedLookupLocations;

function makeResolveTypeReferenceDirective(
  compiler: typeof typescript,
  compilerOptions: typescript.CompilerOptions,
  moduleResolutionHost: ModuleResolutionHost,
  customResolveTypeReferenceDirective:
    | CustomResolveTypeReferenceDirective
    | undefined
): ResolveTypeReferenceDirective {
  if (customResolveTypeReferenceDirective === undefined) {
    return (directive, containingFile, redirectedReference) =>
      compiler.resolveTypeReferenceDirective(
        directive,
        containingFile,
        compilerOptions,
        moduleResolutionHost,
        redirectedReference
      );
  }

  return (directive, containingFile) =>
    customResolveTypeReferenceDirective(
      directive,
      containingFile,
      compilerOptions,
      moduleResolutionHost,
      compiler.resolveTypeReferenceDirective
    );
}

function isJsImplementationOfTypings(
  resolvedModule: ResolvedModule,
  tsResolution: ResolvedModule
) {
  return (
    resolvedModule.resolvedFileName.endsWith('js') &&
    /\.d\.ts$/.test(tsResolution.resolvedFileName)
  );
}

function resolveModule(
  resolveSync: ResolveSync,
  resolveModuleName: ResolveModuleName,
  appendTsTsxSuffixesIfRequired: (filePath: string) => string,
  scriptRegex: RegExp,
  moduleName: string,
  containingFile: string
) {
  let resolutionResult: ResolvedModule;

  try {
    const originalFileName = resolveSync(
      undefined,
      path.normalize(path.dirname(containingFile)),
      moduleName
    );

    const resolvedFileName = appendTsTsxSuffixesIfRequired(originalFileName);

    if (resolvedFileName.match(scriptRegex) !== null) {
      resolutionResult = { resolvedFileName, originalFileName };
    }
    // tslint:disable-next-line:no-empty
  } catch (e) {}

  const tsResolution = resolveModuleName(moduleName, containingFile);

  if (tsResolution.resolvedModule !== undefined) {
    const resolvedFileName = path.normalize(
      tsResolution.resolvedModule.resolvedFileName
    );
    const tsResolutionResult: ResolvedModule = {
      originalFileName: resolvedFileName,
      resolvedFileName,
      isExternalLibraryImport:
        tsResolution.resolvedModule.isExternalLibraryImport
    };

    return resolutionResult! === undefined ||
      resolutionResult.resolvedFileName ===
        tsResolutionResult.resolvedFileName ||
      isJsImplementationOfTypings(resolutionResult!, tsResolutionResult)
      ? tsResolutionResult
      : resolutionResult!;
  }
  return resolutionResult!;
}

type ResolveModuleName = (
  moduleName: string,
  containingFile: string
) => typescript.ResolvedModuleWithFailedLookupLocations;

function makeResolveModuleName(
  compiler: typeof typescript,
  compilerOptions: typescript.CompilerOptions,
  moduleResolutionHost: ModuleResolutionHost,
  customResolveModuleName: CustomResolveModuleName | undefined
): ResolveModuleName {
  if (customResolveModuleName === undefined) {
    return (moduleName: string, containingFile: string) =>
      compiler.resolveModuleName(
        moduleName,
        containingFile,
        compilerOptions,
        moduleResolutionHost
      );
  }

  return (moduleName: string, containingFile: string) =>
    customResolveModuleName(
      moduleName,
      containingFile,
      compilerOptions,
      moduleResolutionHost,
      compiler.resolveModuleName
    );
}

function populateDependencyGraphs(
  resolvedModules: ResolvedModule[],
  instance: TSInstance,
  containingFile: string
) {
  resolvedModules = resolvedModules.filter(
    mod => mod !== null && mod !== undefined
  );

  instance.dependencyGraph[path.normalize(containingFile)] = resolvedModules;

  resolvedModules.forEach(resolvedModule => {
    if (
      instance.reverseDependencyGraph[resolvedModule.resolvedFileName] ===
      undefined
    ) {
      instance.reverseDependencyGraph[resolvedModule.resolvedFileName] = {};
    }
    instance.reverseDependencyGraph[resolvedModule.resolvedFileName]![
      path.normalize(containingFile)
    ] = true;
  });
}

type CacheableFunction = Extract<
  keyof typescript.ModuleResolutionHost,
  'fileExists' | 'directoryExists' | 'realpath'
>;
const cacheableFunctions: CacheableFunction[] = [
  'fileExists',
  'directoryExists',
  'realpath'
];

function addCache(servicesHost: typescript.ModuleResolutionHost) {
  const clearCacheFunctions: Action[] = [];

  cacheableFunctions.forEach((functionToCache: CacheableFunction) => {
    const originalFunction = servicesHost[functionToCache];
    if (originalFunction !== undefined) {
      const cache = createCache<ReturnType<typeof originalFunction>>(
        originalFunction
      );
      servicesHost[functionToCache] = cache.getCached as any;
      clearCacheFunctions.push(cache.clear);
    }
  });

  return () => clearCacheFunctions.forEach(clear => clear());
}

function createCache<TOut>(originalFunction: (arg: string) => TOut) {
  const cache = new Map<string, TOut>();
  return {
    clear: () => {
      cache.clear();
    },
    getCached: (arg: string) => {
      let res = cache.get(arg);
      if (res !== undefined) {
        return res;
      }

      res = originalFunction(arg);
      cache.set(arg, res);
      return res;
    }
  };
}
