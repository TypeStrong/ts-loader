import * as path from 'path';
import * as typescript from 'typescript';
import * as webpack from 'webpack';
import { getParsedCommandLine } from './config';
import * as constants from './constants';
import { getOutputFileNames } from './instances';
import {
  Action,
  CacheableHost,
  ConfigFileInfo,
  CustomResolveModuleName,
  CustomResolveTypeReferenceDirective,
  FilePathKey,
  ModuleResolutionHostMayBeCacheable,
  OutputFile,
  ResolvedModule,
  ResolveSync,
  ServiceHostWhichMayBeCacheable,
  SolutionBuilderWithWatchHost,
  SolutionDiagnostics,
  TSFile,
  TSInstance,
  WatchCallbacks,
  WatchFactory,
  WatchHost,
  WebpackError,
} from './interfaces';
import { makeResolver } from './resolver';
import {
  ensureTrailingDirectorySeparator,
  fileMatchesPatterns,
  formatErrors,
  fsReadFile,
  populateDependencyGraph,
  unorderedRemoveItem,
  useCaseSensitiveFileNames,
} from './utils';

function makeResolversHandlingProjectReferences(
  scriptRegex: RegExp,
  loader: webpack.loader.LoaderContext,
  instance: TSInstance,
  originalFileExists: (fileName: string) => boolean,
  enableFileCaching: boolean
) {
  const {
    compiler,
    compilerOptions,
    appendTsTsxSuffixesIfRequired,
    loaderOptions: {
      resolveModuleName: customResolveModuleName,
      resolveTypeReferenceDirective: customResolveTypeReferenceDirective,
    },
  } = instance;

  const newLine =
    compilerOptions.newLine === constants.CarriageReturnLineFeedCode
      ? constants.CarriageReturnLineFeed
      : compilerOptions.newLine === constants.LineFeedCode
      ? constants.LineFeed
      : constants.EOL;

  // loader.context seems to work fine on Linux / Mac regardless causes problems for @types resolution on Windows for TypeScript < 2.3
  const getCurrentDirectory = () => loader.context;

  // make a (sync) resolver that follows webpack's rules
  const resolveSync = makeResolver(loader._compiler.options);

  const moduleResolutionHost: ModuleResolutionHostMayBeCacheable = {
    trace: logData => instance.log.log(logData),
    fileExists,
    readFile,
    realpath: compiler.sys.realpath && realpath,
    directoryExists,
    getCurrentDirectory,
    getDirectories,
    readDirectory,

    useCaseSensitiveFileNames: () =>
      useCaseSensitiveFileNames(compiler, instance.loaderOptions),
    getNewLine: () => newLine,
    getDefaultLibFileName: options => compiler.getDefaultLibFilePath(options),
  };

  if (enableFileCaching) {
    addCache(moduleResolutionHost);
  }

  return makeResolvers(
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

  function fileExists(filePathToCheck: string) {
    const shouldEmit = fileMatchesPatterns(
      instance.loaderOptions.emitOnly,
      filePathToCheck
    );

    if (!shouldEmit) {
      return false;
    }

    const outputFile = instance.solutionBuilderHost?.getOutputFileFromReferencedProject(
      filePathToCheck
    );
    if (outputFile !== undefined) {
      return !!outputFile;
    }
    return originalFileExists(filePathToCheck);
  }

  function readFile(
    filePath: string,
    encoding?: string | undefined
  ): string | undefined {
    const outputFile = instance.solutionBuilderHost?.getOutputFileFromReferencedProject(
      filePath
    );
    if (outputFile !== undefined) {
      return outputFile ? outputFile.text : undefined;
    }
    return (
      instance.compiler.sys.readFile(filePath, encoding) ||
      fsReadFile(filePath, encoding)
    );
  }

  function directoryExists(directoryName: string) {
    return instance.solutionBuilderHost
      ? instance.solutionBuilderHost.directoryExists!(directoryName)
      : compiler.sys.directoryExists(directoryName);
  }

  function realpath(path: string) {
    return instance.solutionBuilderHost
      ? instance.solutionBuilderHost.realpath!(path)
      : compiler.sys.realpath!(path);
  }

  function getDirectories(path: string) {
    return instance.solutionBuilderHost
      ? instance.solutionBuilderHost.getDirectories!(path)
      : compiler.sys.getDirectories(path);
  }

  function readDirectory(
    path: string,
    extensions?: readonly string[],
    exclude?: readonly string[],
    include?: readonly string[],
    depth?: number
  ) {
    return instance.solutionBuilderHost
      ? instance.solutionBuilderHost.readDirectory!(
          path,
          extensions,
          exclude,
          include,
          depth
        )
      : compiler.sys.readDirectory(path, extensions, exclude, include, depth);
  }
}

/**
 * Create the TypeScript language service
 */
export function makeServicesHost(
  scriptRegex: RegExp,
  loader: webpack.loader.LoaderContext,
  instance: TSInstance,
  projectReferences?: ReadonlyArray<typescript.ProjectReference>
): ServiceHostWhichMayBeCacheable {
  const { compiler, compilerOptions, files, filePathKeyMapper } = instance;

  const {
    moduleResolutionHost: {
      fileExists,
      readFile,
      trace,
      directoryExists,
      realpath,
      getCurrentDirectory,
      getDirectories,
      clearCache,
      useCaseSensitiveFileNames,
      getNewLine,
      getDefaultLibFileName,
      readDirectory,
    },
    resolveModuleNames,
    resolveTypeReferenceDirectives,
  } = makeResolversHandlingProjectReferences(
    scriptRegex,
    loader,
    instance,
    filePathToCheck =>
      compiler.sys.fileExists(filePathToCheck) ||
      fsReadFile(filePathToCheck) !== undefined,
    instance.loaderOptions.experimentalFileCaching
  );

  if (instance.loaderOptions.emitOnly.length > 0) {
    files.forEach((_value, key) => {
      if (!fileMatchesPatterns(instance.loaderOptions.emitOnly, key)) {
        files.delete(key);
      }
    });
  }

  const servicesHost: ServiceHostWhichMayBeCacheable = {
    getProjectVersion: () => `${instance.version}`,

    getProjectReferences: () => projectReferences,

    getScriptFileNames: () =>
      [...files.values()]
        .map(({ fileName }) => fileName)
        .filter(filePath => filePath.match(scriptRegex)),

    getScriptVersion: (fileName: string) => {
      fileName = path.normalize(fileName);
      const key = filePathKeyMapper(fileName);
      const file = files.get(key);
      if (file) {
        return file.version.toString();
      }
      const outputFileAndKey =
        instance.solutionBuilderHost &&
        instance.solutionBuilderHost.getOutputFileAndKeyFromReferencedProject(
          fileName
        );
      if (outputFileAndKey !== undefined) {
        instance.solutionBuilderHost!.outputAffectingInstanceVersion.set(
          outputFileAndKey.key,
          true
        );
      }
      return outputFileAndKey && outputFileAndKey.outputFile
        ? outputFileAndKey.outputFile.version.toString()
        : '';
    },

    getScriptSnapshot: (fileName: string) => {
      // This is called any time TypeScript needs a file's text
      // We either load from memory or from disk
      fileName = path.normalize(fileName);
      const key = filePathKeyMapper(fileName);
      let file = files.get(key);

      if (file === undefined) {
        if (instance.solutionBuilderHost) {
          const outputFileAndKey = instance.solutionBuilderHost.getOutputFileAndKeyFromReferencedProject(
            fileName
          );
          if (outputFileAndKey !== undefined) {
            instance.solutionBuilderHost!.outputAffectingInstanceVersion.set(
              outputFileAndKey.key,
              true
            );
            return outputFileAndKey && outputFileAndKey.outputFile
              ? compiler.ScriptSnapshot.fromString(
                  outputFileAndKey.outputFile.text
                )
              : undefined;
          }
        }

        const text = readFile(fileName);
        if (text === undefined) {
          return undefined;
        }

        file = { fileName, version: 0, text };
        files.set(key, file);
      }

      return compiler.ScriptSnapshot.fromString(file.text!);
    },

    /**
     * getDirectories is also required for full import and type reference completions.
     * Without it defined, certain completions will not be provided
     */
    getDirectories,

    /**
     * For @types expansion, these two functions are needed.
     */
    directoryExists,

    useCaseSensitiveFileNames,

    realpath,

    // The following three methods are necessary for @types resolution from TS 2.4.1 onwards see: https://github.com/Microsoft/TypeScript/issues/16772
    fileExists,
    readFile,
    readDirectory,

    getCurrentDirectory,

    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName,
    getNewLine,
    trace,
    log: trace,

    // used for (/// <reference types="...">) see https://github.com/Realytics/fork-ts-checker-webpack-plugin/pull/250#issuecomment-485061329
    resolveTypeReferenceDirectives,

    resolveModuleNames,

    getCustomTransformers: () => instance.transformers,
    clearCache,
  };

  return servicesHost;
}

function makeResolvers<T extends typescript.ModuleResolutionHost>(
  compiler: typeof typescript,
  compilerOptions: typescript.CompilerOptions,
  moduleResolutionHost: T,
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

    populateDependencyGraph(resolvedModules, instance, containingFile);

    return resolvedModules;
  };

  return {
    resolveTypeReferenceDirectives,
    resolveModuleNames,
    moduleResolutionHost,
  };
}

function createWatchFactory(
  filePathKeyMapper: (fileName: string) => FilePathKey,
  compiler: typeof typescript
): WatchFactory {
  const watchedFiles: WatchCallbacks<typescript.FileWatcherCallback> = new Map();
  const watchedDirectories: WatchCallbacks<typescript.DirectoryWatcherCallback> = new Map();
  const watchedDirectoriesRecursive: WatchCallbacks<typescript.DirectoryWatcherCallback> = new Map();

  return {
    watchedFiles,
    watchedDirectories,
    watchedDirectoriesRecursive,
    invokeFileWatcher,
    watchFile,
    watchDirectory,
  };

  function invokeWatcherCallbacks(
    map:
      | WatchCallbacks<typescript.FileWatcherCallback>
      | WatchCallbacks<typescript.DirectoryWatcherCallback>,
    key: string,
    fileName: string,
    eventKind?: typescript.FileWatcherEventKind
  ): boolean {
    const callbacks = map.get(filePathKeyMapper(key))?.callbacks;
    if (callbacks !== undefined && callbacks.length) {
      // The array copy is made to ensure that even if one of the callback removes the callbacks,
      // we dont miss any callbacks following it
      const cbs = callbacks.slice();
      for (const cb of cbs) {
        cb(fileName, eventKind as typescript.FileWatcherEventKind);
      }
      return true;
    }
    return false;
  }

  function invokeFileWatcher(
    fileName: string,
    eventKind: typescript.FileWatcherEventKind
  ): boolean {
    fileName = path.normalize(fileName);
    let result = invokeWatcherCallbacks(
      watchedFiles,
      fileName,
      fileName,
      eventKind
    );
    if (eventKind !== compiler.FileWatcherEventKind.Changed) {
      const directory = path.dirname(fileName);
      result =
        invokeWatcherCallbacks(watchedDirectories, directory, fileName) ||
        result;
      result = invokeRecursiveDirectoryWatcher(directory, fileName) || result;
    }
    return result;
  }
  ``;

  function invokeRecursiveDirectoryWatcher(
    directory: string,
    fileAddedOrRemoved: string
  ): boolean {
    directory = path.normalize(directory);
    let result = invokeWatcherCallbacks(
      watchedDirectoriesRecursive,
      directory,
      fileAddedOrRemoved
    );
    const basePath = path.dirname(directory);
    if (directory !== basePath) {
      result =
        invokeRecursiveDirectoryWatcher(basePath, fileAddedOrRemoved) || result;
    }
    return result;
  }

  function createWatcher<T>(
    file: string,
    callbacks: WatchCallbacks<T>,
    callback: T
  ): typescript.FileWatcher {
    const key = filePathKeyMapper(file);
    const existing = callbacks.get(key);
    if (existing === undefined) {
      callbacks.set(key, {
        fileName: path.normalize(file),
        callbacks: [callback],
      });
    } else {
      existing.callbacks.push(callback);
    }
    return {
      close: () => {
        const existing = callbacks.get(key);
        if (existing !== undefined) {
          unorderedRemoveItem(existing.callbacks, callback);
          if (!existing.callbacks.length) {
            callbacks.delete(key);
          }
        }
      },
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
}

export function updateFileWithText(
  instance: TSInstance,
  key: FilePathKey,
  filePath: string,
  text: (nFilePath: string) => string
) {
  const nFilePath = path.normalize(filePath);
  const file = instance.files.get(key) || instance.otherFiles.get(key);
  if (file !== undefined) {
    const newText = text(nFilePath);
    if (newText !== file.text) {
      file.text = newText;
      file.version++;
      file.modifiedTime = new Date();
      instance.version++;
      if (!instance.modifiedFiles) {
        instance.modifiedFiles = new Map();
      }
      instance.modifiedFiles.set(key, true);
      if (instance.watchHost !== undefined) {
        instance.watchHost.invokeFileWatcher(
          nFilePath,
          instance.compiler.FileWatcherEventKind.Changed
        );
      }
      if (instance.solutionBuilderHost !== undefined) {
        instance.solutionBuilderHost.invokeFileWatcher(
          nFilePath,
          instance.compiler.FileWatcherEventKind.Changed
        );
      }
    }
  }
}

/**
 * Create the TypeScript Watch host
 */
export function makeWatchHost(
  scriptRegex: RegExp,
  loader: webpack.loader.LoaderContext,
  instance: TSInstance,
  projectReferences?: ReadonlyArray<typescript.ProjectReference>
) {
  const {
    compiler,
    compilerOptions,
    files,
    otherFiles,
    filePathKeyMapper,
  } = instance;

  const { watchFile, watchDirectory, invokeFileWatcher } = createWatchFactory(
    filePathKeyMapper,
    compiler
  );
  const {
    moduleResolutionHost: {
      fileExists,
      readFile,
      trace,
      directoryExists,
      realpath,
      getCurrentDirectory,
      getDirectories,
      useCaseSensitiveFileNames,
      getNewLine,
      getDefaultLibFileName,
      readDirectory,
    },
    resolveModuleNames,
    resolveTypeReferenceDirectives,
  } = makeResolversHandlingProjectReferences(
    scriptRegex,
    loader,
    instance,
    (fileName: string) => {
      const filePath = filePathKeyMapper(fileName);
      return files.has(filePath) || compiler.sys.fileExists(filePath);
    },
    /*enabledCaching*/ false
  );

  const watchHost: WatchHost = {
    rootFiles: getRootFileNames(),
    options: compilerOptions,

    useCaseSensitiveFileNames,
    getNewLine,
    getCurrentDirectory,
    getDefaultLibFileName,

    fileExists,
    readFile: readFileWithCachingText,
    directoryExists,
    getDirectories,
    readDirectory,
    realpath,
    trace,

    watchFile: (fileName, callback, pollingInterval, options) => {
      const outputFileAndKey = instance.solutionBuilderHost?.getOutputFileAndKeyFromReferencedProject(
        fileName
      );
      if (
        !outputFileAndKey ||
        outputFileAndKey.key === filePathKeyMapper(fileName)
      ) {
        return watchFile(fileName, callback, pollingInterval, options);
      }

      // Handle symlink to outputFile
      const outputFileName = instance.solutionBuilderHost!.realpath!(fileName);
      const watcher = watchFile(
        outputFileName,
        (_fileName, eventKind) => callback(fileName, eventKind),
        pollingInterval,
        options
      );

      return { close: () => watcher.close() };
    },
    watchDirectory,

    // used for (/// <reference types="...">) see https://github.com/Realytics/fork-ts-checker-webpack-plugin/pull/250#issuecomment-485061329
    resolveTypeReferenceDirectives,
    resolveModuleNames,

    invokeFileWatcher,
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
        ? compiler.createEmitAndSemanticDiagnosticsBuilderProgram
        : createBuilderProgramWithReferences,

    outputFiles: new Map(),
  };
  return watchHost;

  function getRootFileNames() {
    return [...files.values()]
      .map(({ fileName }) => fileName)
      .filter(filePath => filePath.match(scriptRegex));
  }

  function readFileWithCachingText(fileName: string, encoding?: string) {
    fileName = path.normalize(fileName);
    const key = filePathKeyMapper(fileName);
    const file = files.get(key) || otherFiles.get(key);
    if (file !== undefined) {
      return file.text;
    }
    const text = readFile(fileName, encoding);
    if (text === undefined) {
      return undefined;
    }
    if (
      !instance.solutionBuilderHost?.getOutputFileKeyFromReferencedProject(
        fileName
      )
    ) {
      otherFiles.set(key, { fileName, version: 0, text });
    }
    return text;
  }

  function createBuilderProgramWithReferences(
    rootNames: ReadonlyArray<string> | undefined,
    options: typescript.CompilerOptions | undefined,
    host: typescript.CompilerHost | undefined,
    oldProgram: typescript.EmitAndSemanticDiagnosticsBuilderProgram | undefined,
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
      projectReferences,
    });

    const builderProgramHost: typescript.BuilderProgramHost = host!;
    return compiler.createEmitAndSemanticDiagnosticsBuilderProgram(
      program,
      builderProgramHost,
      oldProgram,
      configFileParsingDiagnostics
    );
  }
}

function normalizeSlashes<T extends string>(file: T): T {
  return file.replace(/\\/g, '/') as T;
}

/**
 * Create the TypeScript Watch host
 */
export function makeSolutionBuilderHost(
  scriptRegex: RegExp,
  loader: webpack.loader.LoaderContext,
  instance: TSInstance
): SolutionBuilderWithWatchHost {
  const {
    compiler,
    compilerOptions,
    appendTsTsxSuffixesIfRequired,
    loaderOptions: {
      resolveModuleName: customResolveModuleName,
      resolveTypeReferenceDirective: customResolveTypeReferenceDirective,
      transpileOnly,
    },
    filePathKeyMapper,
  } = instance;

  // loader.context seems to work fine on Linux / Mac regardless causes problems for @types resolution on Windows for TypeScript < 2.3
  const getCurrentDirectory = () => loader.context;
  const formatDiagnosticHost: typescript.FormatDiagnosticsHost = {
    getCurrentDirectory: compiler.sys.getCurrentDirectory,
    getCanonicalFileName: useCaseSensitiveFileNames(
      compiler,
      instance.loaderOptions
    )
      ? s => s
      : s => s.toLowerCase(),
    getNewLine: () => compiler.sys.newLine,
  };

  const diagnostics: SolutionDiagnostics = {
    global: [],
    perFile: new Map(),
    transpileErrors: [],
  };
  const reportDiagnostic = (d: typescript.Diagnostic) => {
    if (transpileOnly) {
      const filePath = d.file ? filePathKeyMapper(d.file.fileName) : undefined;
      const last =
        diagnostics.transpileErrors[diagnostics.transpileErrors.length - 1];
      if (diagnostics.transpileErrors.length && last[0] === filePath) {
        last[1].push(d);
      } else {
        diagnostics.transpileErrors.push([filePath, [d]]);
      }
    } else if (d.file) {
      const filePath = filePathKeyMapper(d.file.fileName);
      const existing = diagnostics.perFile.get(filePath);
      if (existing) {
        existing.push(d);
      } else {
        diagnostics.perFile.set(filePath, [d]);
      }
    } else {
      diagnostics.global.push(d);
    }
    instance.log.logInfo(compiler.formatDiagnostic(d, formatDiagnosticHost));
  };

  const reportSolutionBuilderStatus = (d: typescript.Diagnostic) =>
    instance.log.logInfo(compiler.formatDiagnostic(d, formatDiagnosticHost));
  const reportWatchStatus = (
    d: typescript.Diagnostic,
    newLine: string,
    _options: typescript.CompilerOptions
  ) =>
    instance.log.logInfo(
      `${compiler.flattenDiagnosticMessageText(
        d.messageText,
        compiler.sys.newLine
      )}${newLine + newLine}`
    );
  const outputFiles = new Map<FilePathKey, OutputFile | false>();
  const writtenFiles: OutputFile[] = [];
  const outputAffectingInstanceVersion = new Map<FilePathKey, true>();
  let timeoutId: [(...args: any[]) => void, any[]] | undefined;

  const symlinkedDirectories = new Map<FilePathKey, string | false>();
  const symlinkedFiles = new Map<FilePathKey, string | false>();
  const cachedSys: CacheableHost = {
    fileExists: fileName => compiler.sys.fileExists(fileName),
    directoryExists: directory => compiler.sys.directoryExists(directory),
    realpath: compiler.sys.realpath && (path => compiler.sys.realpath!(path)),
  };
  addCache(cachedSys);

  const configFileInfo = new Map<FilePathKey, ConfigFileInfo>();
  const solutionBuilderHost: SolutionBuilderWithWatchHost = {
    ...compiler.createSolutionBuilderWithWatchHost(
      compiler.sys,
      compiler.createEmitAndSemanticDiagnosticsBuilderProgram,
      reportDiagnostic,
      reportSolutionBuilderStatus,
      reportWatchStatus
    ),
    useCaseSensitiveFileNames: () =>
      useCaseSensitiveFileNames(compiler, instance.loaderOptions),
    diagnostics,
    ...createWatchFactory(filePathKeyMapper, compiler),
    // Overrides
    getCurrentDirectory,
    // behave as if there is no tsbuild info on disk since we want to generate all outputs in memory and only use those
    readFile: (fileName, encoding) => {
      const outputFile = ensureOutputFile(fileName);
      return outputFile !== undefined
        ? outputFile
          ? outputFile.text
          : undefined
        : readInputFile(fileName, encoding).text;
    },
    writeFile: (name, text, writeByteOrderMark) => {
      const key = filePathKeyMapper(name);
      updateFileWithText(instance, key, name, () => text);
      const existing = outputFiles.get(key);
      const newOutputFile: OutputFile = {
        name,
        text,
        writeByteOrderMark: !!writeByteOrderMark,
        time: new Date(),
        version: existing
          ? existing.text !== text
            ? existing.version + 1
            : existing.version
          : 0,
      };
      outputFiles.set(key, newOutputFile);
      writtenFiles.push(newOutputFile);
      if (
        outputAffectingInstanceVersion.has(key) &&
        (!existing || existing.text !== text)
      ) {
        instance.version++;
      }
      if (
        instance.watchHost &&
        !instance.files.has(key) &&
        !instance.otherFiles.has(key)
      ) {
        // If file wasnt updated in files or other files of instance, let watch host know of the change
        if (!existing) {
          instance.hasUnaccountedModifiedFiles =
            instance.watchHost.invokeFileWatcher(
              name,
              compiler.FileWatcherEventKind.Created
            ) || instance.hasUnaccountedModifiedFiles;
        } else if (existing.version !== newOutputFile.version) {
          instance.hasUnaccountedModifiedFiles =
            instance.watchHost.invokeFileWatcher(
              name,
              compiler.FileWatcherEventKind.Changed
            ) || instance.hasUnaccountedModifiedFiles;
        }
      }
      compiler.sys.writeFile(name, text, writeByteOrderMark);
    },
    getModifiedTime: fileName => {
      const outputFile = ensureOutputFile(fileName);
      if (outputFile !== undefined) {
        return outputFile ? outputFile.time : undefined;
      }
      const key = filePathKeyMapper(fileName);
      const existing = instance.files.get(key) || instance.otherFiles.get(key);
      return existing
        ? existing.modifiedTime
        : compiler.sys.getModifiedTime!(fileName);
    },
    setModifiedTime: (fileName, time) => {
      const outputFile = ensureOutputFile(fileName);
      if (outputFile !== undefined) {
        if (outputFile) {
          outputFile.time = time;
        }
      }
      compiler.sys.setModifiedTime!(fileName, time);
      const key = filePathKeyMapper(fileName);
      const existing = instance.files.get(key) || instance.otherFiles.get(key);
      if (existing) {
        existing.modifiedTime = time;
      }
    },
    fileExists: fileName => {
      const outputFile = ensureOutputFile(fileName);
      if (outputFile !== undefined) {
        return !!outputFile;
      }
      const key = filePathKeyMapper(fileName);
      const existing = instance.files.get(key) || instance.otherFiles.get(key);
      return existing
        ? existing.text !== undefined
        : cachedSys.fileExists(fileName);
    },
    directoryExists: directory => {
      if (cachedSys.directoryExists(directory)) {
        return true;
      }
      const resolvedDirectory = trailingDirectorySeparatorPathKey(directory);
      for (const outputFile of outputFiles.keys()) {
        if (normalizeSlashes(outputFile).startsWith(resolvedDirectory)) {
          return true;
        }
      }

      // see if this is symlink to in memory files's directory
      const ancestor = findExistingAncestor(directory);
      const ancestorRealpath = getRealpathOfExistingDirectory(ancestor);

      return ancestorRealpath
        ? solutionBuilderHost.directoryExists!(
            path.resolve(ancestorRealpath, path.relative(ancestor, directory))
          )
        : false;
    },
    getDirectories: directory =>
      cachedSys.directoryExists(directory)
        ? compiler.sys.getDirectories(directory)
        : [], // Fake for non present directories,
    readDirectory: (path, extensions, exclude, include, depth) =>
      cachedSys.directoryExists(path)
        ? compiler.sys.readDirectory(path, extensions, exclude, include, depth)
        : [], // Fake for non present directories,
    realpath: cachedSys.realpath && (file => getRealpathOfFile(file) || file),
    afterProgramEmitAndDiagnostics: transpileOnly ? undefined : storeDtsFiles,
    setTimeout: (callback, _time, ...args) => {
      timeoutId = [callback, args];
      return timeoutId;
    },
    clearTimeout: _timeoutId => {
      timeoutId = undefined;
    },
    writtenFiles,
    configFileInfo,
    outputAffectingInstanceVersion,
    getOutputFileKeyFromReferencedProject,
    getOutputFileFromReferencedProject,
    getOutputFileAndKeyFromReferencedProject,
    getInputFileNameFromOutput: fileName => {
      const result = getInputFileNameFromOutput(fileName);
      return typeof result === 'string' ? result : undefined;
    },
    getOutputFilesFromReferencedProjectInput,
    buildReferences,
    clearCache,
  };
  solutionBuilderHost.trace = logData => instance.log.logInfo(logData);
  solutionBuilderHost.getParsedCommandLine = file => {
    const config = getParsedCommandLine(compiler, instance.loaderOptions, file);
    configFileInfo.set(filePathKeyMapper(file), { config });
    return config;
  };

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

  function trailingDirectorySeparatorPathKey(directory: string) {
    return ensureTrailingDirectorySeparator(
      normalizeSlashes(filePathKeyMapper(directory))
    );
  }

  function clearCache() {
    cachedSys.clearCache!();
    symlinkedDirectories.clear();
    symlinkedFiles.clear();
  }

  function findExistingAncestor(fileOrDirectory: string) {
    let ancestor = path.dirname(fileOrDirectory);
    while (ancestor !== path.dirname(ancestor)) {
      if (cachedSys.directoryExists(ancestor)) return ancestor;
      ancestor = path.dirname(ancestor);
    }
    // Root should always be present
    return ancestor;
  }

  function getRealpathOfExistingDirectory(
    directory: string
  ): string | undefined {
    return getRealpath(directory, symlinkedDirectories, () =>
      cachedSys.realpath!(directory)
    );
  }

  function getRealpathOfFile(file: string): string | undefined {
    return getRealpath(file, symlinkedFiles, () => {
      if (cachedSys.fileExists(file)) return cachedSys.realpath!(file);

      // see if this is symlink to in memory file
      const ancestor = findExistingAncestor(file);
      const ancestorRealpath = getRealpathOfExistingDirectory(ancestor);
      if (!ancestorRealpath) return file;

      const newFile = path.resolve(
        ancestorRealpath,
        path.relative(ancestor, file)
      );
      return getRealpathOfFile(newFile) || newFile;
    });
  }

  function getRealpath(
    fileOrDirectory: string,
    symlinked: Map<FilePathKey, string | false>,
    realpath: () => string
  ): string | undefined {
    if (!cachedSys.realpath) return undefined;
    const fileOrDirectoryKey = filePathKeyMapper(fileOrDirectory);
    const existing = symlinked.get(fileOrDirectoryKey);
    if (existing !== undefined) return existing || undefined;

    const real = realpath();
    if (
      real === fileOrDirectory ||
      filePathKeyMapper(real) === fileOrDirectoryKey
    ) {
      // not symlinked
      symlinked.set(fileOrDirectoryKey, false);
      return undefined;
    }

    symlinked.set(fileOrDirectoryKey, real);
    return real;
  }

  function buildReferences() {
    if (!timeoutId) {
      return;
    }
    diagnostics.global.length = 0;
    diagnostics.perFile.clear();
    diagnostics.transpileErrors.length = 0;

    while (timeoutId) {
      const [callback, args] = timeoutId;
      timeoutId = undefined;
      callback(...args);
    }
  }

  function storeDtsFiles(
    builderProgram: typescript.EmitAndSemanticDiagnosticsBuilderProgram
  ) {
    const program = builderProgram.getProgram();
    for (const configInfo of configFileInfo.values()) {
      if (
        !configInfo.config ||
        program.getRootFileNames() !== configInfo.config.fileNames ||
        program.getCompilerOptions() !== configInfo.config.options ||
        program.getProjectReferences() !== configInfo.config.projectReferences
      ) {
        continue;
      }
      configInfo.dtsFiles = program
        .getSourceFiles()
        .map(file => path.resolve(file.fileName))
        .filter(fileName => fileName.match(constants.dtsDtsxOrDtsDtsxMapRegex));
      return;
    }
  }

  function getInputFileNameFromOutput(
    outputFileName: string
  ): string | true | undefined {
    const resolvedFileName = filePathKeyMapper(outputFileName);
    for (const configInfo of configFileInfo.values()) {
      ensureInputOutputInfo(configInfo);
      if (configInfo.outputFileNames) {
        for (const {
          inputFileName,
          outputNames,
        } of configInfo.outputFileNames.values()) {
          if (outputNames.indexOf(resolvedFileName) !== -1) {
            return inputFileName;
          }
        }
      }
      if (
        configInfo.tsbuildInfoFile &&
        filePathKeyMapper(configInfo.tsbuildInfoFile) === resolvedFileName
      ) {
        return true;
      }
    }

    const symlinkedOutputFileName = getRealpathOfFile(outputFileName);
    return symlinkedOutputFileName
      ? getInputFileNameFromOutput(symlinkedOutputFileName)
      : undefined;
  }

  function ensureInputOutputInfo(configInfo: ConfigFileInfo) {
    if (configInfo.outputFileNames || !configInfo.config) {
      return;
    }
    configInfo.outputFileNames = new Map();
    configInfo.config.fileNames.forEach(inputFile =>
      configInfo.outputFileNames!.set(filePathKeyMapper(inputFile), {
        inputFileName: path.resolve(inputFile),
        outputNames: getOutputFileNames(
          instance,
          configInfo.config!,
          inputFile
        ).map(filePathKeyMapper),
      })
    );

    configInfo.tsbuildInfoFile = instance.compiler
      .getTsBuildInfoEmitOutputFilePath
      ? instance.compiler.getTsBuildInfoEmitOutputFilePath(
          configInfo.config.options
        )
      : // before api
        (instance.compiler as any).getOutputPathForBuildInfo(
          configInfo.config.options
        );
  }

  function getOutputFileAndKeyFromReferencedProject(
    outputFileName: string
  ): { key: FilePathKey; outputFile: OutputFile | false } | undefined {
    const key = getOutputFileKeyFromReferencedProject(outputFileName);
    return key && { key, outputFile: outputFiles.get(key)! };
  }

  function getOutputFileFromReferencedProject(
    outputFileName: string
  ): OutputFile | false | undefined {
    const key = getOutputFileKeyFromReferencedProject(outputFileName);
    return key && outputFiles.get(key);
  }

  function getOutputFileKeyFromReferencedProject(
    outputFileName: string
  ): FilePathKey | undefined {
    const key = filePathKeyMapper(outputFileName);
    const result = outputFiles.has(key);
    if (result) return key;

    const symlinkedOutputFileName = getRealpathOfFile(outputFileName);
    return symlinkedOutputFileName
      ? getOutputFileKeyFromReferencedProject(symlinkedOutputFileName)
      : undefined;
  }

  function ensureOutputFile(
    outputFileName: string,
    encoding?: string
  ): OutputFile | false | undefined {
    const outputFile = getOutputFileFromReferencedProject(outputFileName);
    if (outputFile !== undefined) {
      return outputFile;
    }
    if (!getInputFileNameFromOutput(outputFileName)) {
      return undefined;
    }

    outputFileName = getRealpathOfFile(outputFileName) || outputFileName;
    const key = filePathKeyMapper(outputFileName);
    const text = compiler.sys.readFile(outputFileName, encoding);
    if (text === undefined) {
      outputFiles.set(key, false);
      return false;
    }
    const newOutputFile: OutputFile = {
      name: outputFileName,
      text,
      writeByteOrderMark: false,
      time: compiler.sys.getModifiedTime!(outputFileName)!,
      version: 0,
    };
    outputFiles.set(key, newOutputFile);
    return newOutputFile;
  }

  function getOutputFilesFromReferencedProjectInput(inputFileName: string) {
    const resolvedFileName = filePathKeyMapper(inputFileName);
    for (const configInfo of configFileInfo.values()) {
      ensureInputOutputInfo(configInfo);
      if (configInfo.outputFileNames) {
        const result = configInfo.outputFileNames.get(resolvedFileName);
        if (result) {
          return result.outputNames
            .map(outputFile => outputFiles.get(outputFile)!)
            .filter(output => !!output) as OutputFile[];
        }
      }
    }
    return [];
  }

  function readInputFile(inputFileName: string, encoding: string | undefined) {
    const resolvedFileName = filePathKeyMapper(inputFileName);
    const existing = instance.otherFiles.get(resolvedFileName);
    if (existing) {
      return existing;
    }
    inputFileName = path.resolve(inputFileName);
    const tsFile: TSFile = {
      fileName: inputFileName,
      version: 1,
      text: compiler.sys.readFile(inputFileName, encoding),
      modifiedTime: compiler.sys.getModifiedTime!(inputFileName),
    };
    instance.otherFiles.set(resolvedFileName, tsFile);
    return tsFile;
  }
}

export function getSolutionErrors(instance: TSInstance, context: string) {
  const solutionErrors: WebpackError[] = [];
  if (
    instance.solutionBuilderHost &&
    instance.solutionBuilderHost.diagnostics.transpileErrors.length
  ) {
    instance.solutionBuilderHost.diagnostics.transpileErrors.forEach(
      ([filePath, errors]) =>
        solutionErrors.push(
          ...formatErrors(
            errors,
            instance.loaderOptions,
            instance.colors,
            instance.compiler,
            { file: filePath ? undefined : 'tsconfig.json' },
            context
          )
        )
    );
  }
  return solutionErrors;
}

type ResolveTypeReferenceDirective = (
  directive: string,
  containingFile: string,
  redirectedReference?: typescript.ResolvedProjectReference
) => typescript.ResolvedTypeReferenceDirectiveWithFailedLookupLocations;

function makeResolveTypeReferenceDirective(
  compiler: typeof typescript,
  compilerOptions: typescript.CompilerOptions,
  moduleResolutionHost: typescript.ModuleResolutionHost,
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
        tsResolution.resolvedModule.isExternalLibraryImport,
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
  moduleResolutionHost: typescript.ModuleResolutionHost,
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

function addCache(host: CacheableHost): void {
  const clearCacheFunctions: Action[] = [];
  host.fileExists = createCache(host.fileExists);
  host.directoryExists = createCache(host.directoryExists);
  host.realpath = host.realpath && createCache(host.realpath);
  host.clearCache = () => clearCacheFunctions.forEach(clear => clear());

  function createCache<TOut>(originalFunction: (arg: string) => TOut) {
    const cache = new Map<string, TOut>();
    clearCacheFunctions.push(() => cache.clear());
    return function getCached(arg: string) {
      let res = cache.get(arg);
      if (res !== undefined) {
        return res;
      }

      res = originalFunction(arg);
      cache.set(arg, res);
      return res;
    };
  }
}
