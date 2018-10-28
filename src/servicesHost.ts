import * as path from 'path';
import * as typescript from 'typescript';

import * as constants from './constants';
import {
  CustomResolveModuleName,
  ModuleResolutionHost,
  ResolvedModule,
  ResolveSync,
  TSInstance,
  WatchHost,
  Webpack
} from './interfaces';
import * as logger from './logger';
import { makeResolver } from './resolver';
import { appendSuffixesIfMatch, readFile, unorderedRemoveItem } from './utils';

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
  loader: Webpack,
  instance: TSInstance,
  enableFileCaching: boolean,
  projectReferences?: ReadonlyArray<typescript.ProjectReference>
): ServiceHostWhichMayBeCacheable {
  const {
    compiler,
    compilerOptions,
    files,
    loaderOptions: {
      appendTsSuffixTo,
      appendTsxSuffixTo,
      resolveModuleName: customResolveModuleName
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
    directoryExists: compiler.sys.directoryExists
  };

  const clearCache = enableFileCaching ? addCache(moduleResolutionHost) : null;

  // loader.context seems to work fine on Linux / Mac regardless causes problems for @types resolution on Windows for TypeScript < 2.3
  const getCurrentDirectory = () => loader.context;

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

    /* Unclear if this is useful
        resolveTypeReferenceDirectives: (typeDirectiveNames: string[], containingFile: string) =>
            typeDirectiveNames.map(directive =>
                compiler.resolveTypeReferenceDirective(directive, containingFile, compilerOptions, moduleResolutionHost).resolvedTypeReferenceDirective),
        */

    resolveModuleNames: (moduleNames, containingFile) =>
      resolveModuleNames(
        resolveSync,
        moduleResolutionHost,
        appendTsSuffixTo,
        appendTsxSuffixTo,
        scriptRegex,
        instance,
        moduleNames,
        containingFile,
        getResolutionStrategy,
        customResolveModuleName
      ),

    getCustomTransformers: () => instance.transformers
  };

  return { servicesHost, clearCache };
}

/**
 * Create the TypeScript Watch host
 */
export function makeWatchHost(
  scriptRegex: RegExp,
  log: logger.Logger,
  loader: Webpack,
  instance: TSInstance,
  appendTsSuffixTo: RegExp[],
  appendTsxSuffixTo: RegExp[],
  projectReferences?: ReadonlyArray<typescript.ProjectReference>
) {
  const { compiler, compilerOptions, files, otherFiles } = instance;

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

    resolveModuleNames: (moduleNames, containingFile) =>
      resolveModuleNames(
        resolveSync,
        moduleResolutionHost,
        appendTsSuffixTo,
        appendTsxSuffixTo,
        scriptRegex,
        instance,
        moduleNames,
        containingFile,
        getResolutionStrategy
      ),

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

function resolveModuleNames(
  resolveSync: ResolveSync,
  moduleResolutionHost: ModuleResolutionHost,
  appendTsSuffixTo: RegExp[],
  appendTsxSuffixTo: RegExp[],
  scriptRegex: RegExp,
  instance: TSInstance,
  moduleNames: string[],
  containingFile: string,
  resolutionStrategy: ResolutionStrategy,
  customResolveModuleName?: CustomResolveModuleName
) {
  const resolvedModules = moduleNames.map(moduleName =>
    resolveModuleName(
      resolveSync,
      moduleResolutionHost,
      appendTsSuffixTo,
      appendTsxSuffixTo,
      scriptRegex,
      instance,
      moduleName,
      containingFile,
      resolutionStrategy,
      customResolveModuleName
    )
  );

  populateDependencyGraphs(resolvedModules, instance, containingFile);

  return resolvedModules;
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

function applyTsResolver(
  compiler: typeof typescript,
  moduleName: string,
  containingFile: string,
  compilerOptions: typescript.CompilerOptions,
  moduleResolutionHost: typescript.ModuleResolutionHost
) {
  return compiler.resolveModuleName(
    moduleName,
    containingFile,
    compilerOptions,
    moduleResolutionHost
  );
}

function resolveModuleName(
  resolveSync: ResolveSync,
  moduleResolutionHost: ModuleResolutionHost,
  appendTsSuffixTo: RegExp[],
  appendTsxSuffixTo: RegExp[],
  scriptRegex: RegExp,
  instance: TSInstance,
  moduleName: string,
  containingFile: string,
  resolutionStrategy: ResolutionStrategy,
  customResolveModuleName?: CustomResolveModuleName
) {
  const { compiler, compilerOptions } = instance;

  let resolutionResult: ResolvedModule;

  try {
    const originalFileName = resolveSync(
      undefined,
      path.normalize(path.dirname(containingFile)),
      moduleName
    );

    const resolvedFileName =
      appendTsSuffixTo.length > 0 || appendTsxSuffixTo.length > 0
        ? appendSuffixesIfMatch(
            {
              '.ts': appendTsSuffixTo,
              '.tsx': appendTsxSuffixTo
            },
            originalFileName
          )
        : originalFileName;

    if (resolvedFileName.match(scriptRegex) !== null) {
      resolutionResult = { resolvedFileName, originalFileName };
    }
    // tslint:disable-next-line:no-empty
  } catch (e) {}

  const tsResolution =
    customResolveModuleName !== undefined
      ? customResolveModuleName(
          moduleName,
          containingFile,
          compilerOptions,
          moduleResolutionHost,
          (
            moduleName: string,
            containingFile: string,
            compilerOptions: typescript.CompilerOptions,
            moduleResolutionHost: typescript.ModuleResolutionHost
          ) =>
            applyTsResolver(
              compiler,
              moduleName,
              containingFile,
              compilerOptions,
              moduleResolutionHost
            )
        )
      : applyTsResolver(
          compiler,
          moduleName,
          containingFile,
          compilerOptions,
          moduleResolutionHost
        );

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

    return resolutionStrategy(resolutionResult!, tsResolutionResult);
  }
  return resolutionResult!;
}

type ResolutionStrategy = (
  resolutionResult: ResolvedModule | undefined,
  tsResolutionResult: ResolvedModule
) => ResolvedModule;

function getResolutionStrategy(
  resolutionResult: ResolvedModule | undefined,
  tsResolutionResult: ResolvedModule
): ResolvedModule {
  return resolutionResult! === undefined ||
    resolutionResult!.resolvedFileName ===
      tsResolutionResult.resolvedFileName ||
    isJsImplementationOfTypings(resolutionResult!, tsResolutionResult)
    ? tsResolutionResult
    : resolutionResult!;
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
      servicesHost[
        functionToCache
      ] = cache.getCached as typescript.ModuleResolutionHost[CacheableFunction];
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
