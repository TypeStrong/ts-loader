import * as path from 'path';
import type * as typescript from 'typescript';
import * as webpack from 'webpack';
import { getParsedCommandLine } from './config';
import * as constants from './constants';
import { getOutputFileNames } from './instances';
import {
  CacheableHost,
  ConfigFileInfo,
  CustomResolveModuleName,
  CustomResolveTypeReferenceDirective,
  FilePathKey,
  ModuleResolutionHostMayBeCacheable,
  ResolvedModule,
  ServiceHostWhichMayBeCacheable,
  SolutionBuilderWithWatchHost,
  SolutionDiagnostics,
  TSInstance,
  WatchCallbacks,
  WatchFactory,
  WatchHost,
  WebpackLoaderContext,
} from './interfaces';
import { makeResolver, ResolveSync } from './resolver';
import {
  formatErrors,
  fsReadFile,
  populateDependencyGraph,
  unorderedRemoveItem,
  useCaseSensitiveFileNames,
} from './utils';

function makeResolversAndModuleResolutionHost(
  scriptRegex: RegExp,
  loader: WebpackLoaderContext,
  instance: TSInstance,
  fileExists: (fileName: string) => boolean,
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

  function readFile(
    filePath: string,
    encoding?: BufferEncoding | undefined
  ): string | undefined {
    return (
      instance.compiler.sys.readFile(filePath, encoding) ||
      fsReadFile(filePath, encoding)
    );
  }

  function directoryExists(directoryName: string) {
    return compiler.sys.directoryExists(directoryName);
  }

  function realpath(path: string) {
    return compiler.sys.realpath!(path);
  }

  function getDirectories(path: string) {
    return compiler.sys.getDirectories(path);
  }

  function readDirectory(
    path: string,
    extensions?: readonly string[],
    exclude?: readonly string[],
    include?: readonly string[],
    depth?: number
  ) {
    return compiler.sys.readDirectory(
      path,
      extensions,
      exclude,
      include,
      depth
    );
  }
}

/**
 * Create the TypeScript language service
 */
export function makeServicesHost(
  scriptRegex: RegExp,
  loader: WebpackLoaderContext,
  instance: TSInstance,
  projectReferences?: ReadonlyArray<typescript.ProjectReference>
): ServiceHostWhichMayBeCacheable {
  const { compiler, compilerOptions, files, filePathKeyMapper } = instance;

  const {
    moduleResolutionHost,
    resolveModuleNames,
    resolveTypeReferenceDirectives,
  } = makeResolversAndModuleResolutionHost(
    scriptRegex,
    loader,
    instance,
    filePathToCheck =>
      compiler.sys.fileExists(filePathToCheck) ||
      fsReadFile(filePathToCheck) !== undefined,
    instance.loaderOptions.experimentalFileCaching
  );

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

      const outputFileAndKey = instance.solutionBuilderHost?.getOutputFileAndKeyFromReferencedProject(
        fileName
      );
      if (outputFileAndKey !== undefined) {
        instance.solutionBuilderHost!.outputAffectingInstanceVersion.set(
          outputFileAndKey.key,
          true
        );
      }
      return outputFileAndKey && outputFileAndKey.outputFile
        ? outputFileAndKey.outputFile
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
          const outputFileAndKey = instance.solutionBuilderHost.getOutputFileTextAndKeyFromReferencedProject(
            fileName
          );
          if (outputFileAndKey !== undefined) {
            instance.solutionBuilderHost!.outputAffectingInstanceVersion.set(
              outputFileAndKey.key,
              true
            );
            return outputFileAndKey && outputFileAndKey.text !== undefined
              ? compiler.ScriptSnapshot.fromString(outputFileAndKey.text)
              : undefined;
          }
        }

        const text = moduleResolutionHost.readFile(fileName);
        if (text === undefined) {
          return undefined;
        }

        file = { fileName, version: 0, text };
        files.set(key, file);
      }

      return compiler.ScriptSnapshot.fromString(file.text!);
    },
    ...moduleResolutionHost,
    getCompilationSettings: () => compilerOptions,
    log: moduleResolutionHost.trace,

    // used for (/// <reference types="...">) see https://github.com/Realytics/fork-ts-checker-webpack-plugin/pull/250#issuecomment-485061329
    resolveTypeReferenceDirectives,
    resolveModuleNames,

    getCustomTransformers: () => instance.transformers,
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
    }
  }
}

/**
 * Create the TypeScript Watch host
 */
export function makeWatchHost(
  scriptRegex: RegExp,
  loader: WebpackLoaderContext,
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
    moduleResolutionHost,
    resolveModuleNames,
    resolveTypeReferenceDirectives,
  } = makeResolversAndModuleResolutionHost(
    scriptRegex,
    loader,
    instance,
    fileName =>
      files.has(filePathKeyMapper(fileName)) ||
      compiler.sys.fileExists(fileName),
    /*enabledCaching*/ false
  );

  const watchHost: WatchHost = {
    rootFiles: getRootFileNames(),
    options: compilerOptions,

    ...moduleResolutionHost,
    readFile: readFileWithCachingText,

    watchFile: (fileName, callback, pollingInterval, options) => {
      const outputFileKey = instance.solutionBuilderHost?.getOutputFileKeyFromReferencedProject(
        fileName
      );
      if (!outputFileKey || outputFileKey === filePathKeyMapper(fileName)) {
        return watchFile(fileName, callback, pollingInterval, options);
      }

      // Handle symlink to outputFile
      const outputFileName = instance.solutionBuilderHost!.realpath!(fileName);
      return watchFile(
        outputFileName,
        (_fileName, eventKind) => callback(fileName, eventKind),
        pollingInterval,
        options
      );
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
    const text = moduleResolutionHost.readFile(fileName, encoding);
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

const missingFileModifiedTime = new Date(0);

/**
 * Create the TypeScript Watch host
 */
export function makeSolutionBuilderHost(
  scriptRegex: RegExp,
  loader: WebpackLoaderContext,
  instance: TSInstance
): SolutionBuilderWithWatchHost {
  const {
    compiler,
    loaderOptions: { transpileOnly },
    filePathKeyMapper,
  } = instance;

  // loader.context seems to work fine on Linux / Mac regardless causes problems for @types resolution on Windows for TypeScript < 2.3
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
  const outputFiles = new Map<FilePathKey, string | false>();
  const inputFiles = new Map<FilePathKey, Date>();
  const writtenFiles: typescript.OutputFile[] = [];
  const outputAffectingInstanceVersion = new Map<FilePathKey, true>();
  let timeoutId: [(...args: any[]) => void, any[]] | undefined;

  const {
    resolveModuleNames,
    resolveTypeReferenceDirectives,
    moduleResolutionHost,
  } = makeResolversAndModuleResolutionHost(
    scriptRegex,
    loader,
    instance,
    fileName => {
      const filePathKey = filePathKeyMapper(fileName);
      return (
        instance.files.has(filePathKey) ||
        instance.otherFiles.has(filePathKey) ||
        compiler.sys.fileExists(fileName)
      );
    },
    /*enableFileCaching*/ true
  );

  const configFileInfo = new Map<FilePathKey, ConfigFileInfo>();
  const allWatches: typescript.FileWatcher[] = [];
  const sysHost = compiler.createSolutionBuilderWithWatchHost(
    compiler.sys,
    compiler.createEmitAndSemanticDiagnosticsBuilderProgram,
    reportDiagnostic,
    reportSolutionBuilderStatus,
    reportWatchStatus
  );
  const solutionBuilderHost: SolutionBuilderWithWatchHost = {
    ...sysHost,
    ...moduleResolutionHost,
    resolveModuleNames,
    resolveTypeReferenceDirectives,
    diagnostics,
    ...createWatchFactory(filePathKeyMapper, compiler),
    // Overrides
    writeFile: (name, text, writeByteOrderMark) => {
      const key = filePathKeyMapper(name);
      updateFileWithText(instance, key, name, () => text);
      const existing = ensureOutputFile(name);
      const hash = hashOutputText(text);
      outputFiles.set(key, hash);
      writtenFiles.push({
        name,
        text,
        writeByteOrderMark: !!writeByteOrderMark,
      });
      compiler.sys.writeFile(name, text, writeByteOrderMark);
      moduleResolutionHost.fileExistsCache?.delete(name);
      if (
        outputAffectingInstanceVersion.has(key) &&
        (!existing || existing !== hash)
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
        } else if (existing !== hash) {
          instance.hasUnaccountedModifiedFiles =
            instance.watchHost.invokeFileWatcher(
              name,
              compiler.FileWatcherEventKind.Changed
            ) || instance.hasUnaccountedModifiedFiles;
        }
      }
    },
    createDirectory:
      sysHost.createDirectory &&
      (directory => {
        sysHost.createDirectory!(directory);
        moduleResolutionHost.directoryExistsCache?.delete(directory);
      }),
    afterProgramEmitAndDiagnostics: transpileOnly ? undefined : storeDtsFiles,
    setTimeout: (callback, _time, ...args) => {
      timeoutId = [callback, args];
      return timeoutId;
    },
    clearTimeout: _timeoutId => {
      timeoutId = undefined;
    },
    getParsedCommandLine: file => {
      const config = getParsedCommandLine(
        compiler,
        instance.loaderOptions,
        file
      );
      configFileInfo.set(filePathKeyMapper(file), { config });
      return config;
    },
    writtenFiles,
    configFileInfo,
    outputAffectingInstanceVersion,
    getInputFileStamp,
    updateSolutionBuilderInputFile,
    getOutputFileKeyFromReferencedProject,
    getOutputFileAndKeyFromReferencedProject,
    getOutputFileTextAndKeyFromReferencedProject,
    getInputFileNameFromOutput: fileName => {
      const result = getInputFileNameFromOutput(fileName);
      return typeof result === 'string' ? result : undefined;
    },
    getOutputFilesFromReferencedProjectInput,
    buildReferences,
    ensureAllReferenceTimestamps,
    clearCache,
    close,
  };

  return solutionBuilderHost;

  function close() {
    allWatches.slice().forEach(w => w.close());
  }

  function clearCache() {
    moduleResolutionHost.clearCache!();
    outputFiles.clear();
    inputFiles.clear();
  }

  function buildReferences() {
    if (!timeoutId) {
      ensureAllReferenceTimestamps();
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
    ensureAllReferenceTimestamps();
  }

  function ensureAllReferenceTimestamps() {
    if (inputFiles.size !== solutionBuilderHost.watchedFiles.size) {
      for (const {
        fileName,
      } of instance.solutionBuilderHost!.watchedFiles.values()) {
        instance.solutionBuilderHost!.getInputFileStamp(fileName);
      }
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
          if (
            outputNames.some(
              outputName => resolvedFileName === filePathKeyMapper(outputName)
            )
          ) {
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

    const realPath = solutionBuilderHost.realpath!(outputFileName);
    return filePathKeyMapper(realPath) !== resolvedFileName
      ? getInputFileNameFromOutput(realPath)
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
        ),
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
  ): { key: FilePathKey; outputFile: string | false } | undefined {
    const outputFile = ensureOutputFile(outputFileName);
    return outputFile !== undefined
      ? {
          key: getOutputFileKeyFromReferencedProject(outputFileName)!,
          outputFile,
        }
      : undefined;
  }

  function getOutputFileTextAndKeyFromReferencedProject(
    outputFileName: string
  ): { key: FilePathKey; text: string | undefined } | undefined {
    const key = getOutputFileKeyFromReferencedProject(outputFileName);
    if (!key) {
      return undefined;
    }

    const file = writtenFiles.find(w => filePathKeyMapper(w.name) === key);
    if (file) {
      return { key, text: file.text };
    }

    const outputFile = outputFiles.get(key);
    return {
      key,
      text:
        outputFile !== false
          ? compiler.sys.readFile(outputFileName)
          : undefined,
    };
  }

  function getOutputFileKeyFromReferencedProject(
    outputFileName: string
  ): FilePathKey | undefined {
    const key = filePathKeyMapper(outputFileName);
    if (outputFiles.has(key)) return key;

    const realKey = filePathKeyMapper(
      solutionBuilderHost.realpath!(outputFileName)
    );
    if (realKey !== key && outputFiles.has(realKey)) return realKey;

    return getInputFileNameFromOutput(outputFileName) ? realKey : undefined;
  }

  function hashOutputText(text: string) {
    return compiler.sys.createHash ? compiler.sys.createHash(text) : text;
  }

  function ensureOutputFile(
    outputFileName: string
  ): string | false | undefined {
    const key = getOutputFileKeyFromReferencedProject(outputFileName);
    if (!key) {
      return undefined;
    }
    const outputFile = outputFiles.get(key);
    if (outputFile !== undefined) {
      return outputFile;
    }

    if (!getInputFileNameFromOutput(outputFileName)) {
      return undefined;
    }

    const text = compiler.sys.readFile(outputFileName);
    const hash = text === undefined ? false : hashOutputText(text);
    outputFiles.set(key, hash);
    return hash;
  }

  function getTypeScriptOutputFile(
    outputFileName: string
  ): typescript.OutputFile | undefined {
    const key = filePathKeyMapper(outputFileName);
    const writtenFile = writtenFiles.find(
      w => filePathKeyMapper(w.name) === key
    );
    if (writtenFile) return writtenFile;

    // Read from sys
    const text = compiler.sys.readFile(outputFileName);
    return text !== undefined
      ? {
          name: outputFileName,
          text,
          writeByteOrderMark: false,
        }
      : undefined;
  }

  function getOutputFilesFromReferencedProjectInput(
    inputFileName: string
  ): typescript.OutputFile[] {
    const resolvedFileName = filePathKeyMapper(inputFileName);
    for (const configInfo of configFileInfo.values()) {
      ensureInputOutputInfo(configInfo);
      if (configInfo.outputFileNames) {
        const result = configInfo.outputFileNames.get(resolvedFileName);
        if (result) {
          return result.outputNames
            .map(getTypeScriptOutputFile)
            .filter(output => !!output) as typescript.OutputFile[];
        }
      }
    }
    return [];
  }

  function getInputFileStamp(fileName: string) {
    const key = filePathKeyMapper(fileName);
    const existing = inputFiles.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const time =
      compiler.sys.getModifiedTime!(fileName) || missingFileModifiedTime;
    inputFiles.set(key, time);
    return time;
  }

  function updateSolutionBuilderInputFile(fileName: string) {
    const key = filePathKeyMapper(fileName);
    const existing = inputFiles.get(key) || missingFileModifiedTime;
    const newTime =
      compiler.sys.getModifiedTime!(fileName) || missingFileModifiedTime;
    if (existing.getTime() === newTime.getTime()) {
      return;
    }
    const eventKind =
      existing == missingFileModifiedTime
        ? compiler.FileWatcherEventKind.Created
        : newTime === missingFileModifiedTime
        ? compiler.FileWatcherEventKind.Deleted
        : compiler.FileWatcherEventKind.Changed;
    solutionBuilderHost.invokeFileWatcher(fileName, eventKind);
  }
}

export function getSolutionErrors(instance: TSInstance, context: string) {
  const solutionErrors: webpack.WebpackError[] = [];
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

    if (originalFileName) {
      const resolvedFileName = appendTsTsxSuffixesIfRequired(originalFileName);

      if (resolvedFileName.match(scriptRegex) !== null) {
        resolutionResult = { resolvedFileName, originalFileName };
      }
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
  host.fileExists = createCache(
    host.fileExists,
    (host.fileExistsCache = new Map())
  );
  host.directoryExists = createCache(
    host.directoryExists,
    (host.directoryExistsCache = new Map())
  );
  host.realpath =
    host.realpath &&
    createCache(host.realpath, (host.realpathCache = new Map()));
  host.clearCache = clearCache;

  function createCache<TOut>(
    originalFunction: (arg: string) => TOut,
    cache: Map<string, TOut>
  ) {
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

  function clearCache() {
    host.fileExistsCache?.clear();
    host.directoryExistsCache?.clear();
    host.realpathCache?.clear();
  }
}
