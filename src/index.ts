import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as webpack from 'webpack';

import { createColors } from './colors';
import {
  emitPendingDeclarationFiles,
  reportPendingTypeScriptDiagnostics,
} from './diagnostics';
import {
  createTypeScriptInstance,
  getTypeScriptEmit,
  recheckAllTransitiveDependants,
} from './typeScriptApi';
import type {
  FilePath,
  LoaderOptions,
  LoaderOptionsCache,
  LogLevel,
  ResolvedFilePathCache,
  TSFile,
  TSInstance,
} from './types';
import * as loaderUtils from './loaderUtils';
import { getTSInstanceFromCache, setTSInstanceInCache } from './instance-cache';
import * as logger from './logger';
import type { RawSourceMap } from 'source-map';
import { SourceMapConsumer, SourceMapGenerator } from 'source-map';

/**
 * we can only use SourceMapConsumer if the version available has a destroy method
 * see https://github.com/mozilla/source-map/blob/master/CHANGELOG.md#070
 */
const canUseSourceMapConsumer =
  typeof SourceMapConsumer === 'function' &&
  typeof SourceMapConsumer.prototype === 'object' &&
  typeof SourceMapConsumer.prototype.destroy === 'function';

const loaderOptionsCache: LoaderOptionsCache = {};

function loader(
  this: webpack.LoaderContext<LoaderOptions>,
  contents: string,
  inputSourceMap?: Record<string, unknown>,
) {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  this.cacheable && this.cacheable();
  const callback = this.async();
  const configParseErrorMessage = successLoader(
    this,
    contents,
    inputSourceMap,
    callback,
  );
  if (configParseErrorMessage !== undefined) {
    // Reconstructed here, in `loader`'s own frame, so the stack trace
    // matches classic ts-loader's single `at Object.loader (...)` frame.
    callback(new Error(configParseErrorMessage));
  }
}

function successLoader(
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  contents: string,
  inputSourceMap: Record<string, unknown> | undefined,
  callback: ReturnType<webpack.LoaderContext<LoaderOptions>['async']>,
): string | undefined {
  try {
    const options = getLoaderOptions(loaderContext);
    const instance = getTypeScriptInstance(options, loaderContext);
    const rawFilePath = path.normalize(loaderContext.resourcePath);
    const filePath = appendSuffixesIfRequired(rawFilePath, options);
    const fileVersion = updateFileInCache(filePath, contents, instance);
    const { outputText, sourceMapText, configParseErrorMessage } =
      getTypeScriptEmit(filePath, contents, instance, loaderContext);

    if (configParseErrorMessage !== undefined) {
      return configParseErrorMessage;
    }

    makeSourceMapAndFinish(
      sourceMapText,
      outputText,
      filePath,
      contents,
      loaderContext,
      fileVersion,
      callback,
      options.allowTsInNodeModules,
      inputSourceMap,
    );
  } catch (error) {
    callback(error instanceof Error ? error : new Error(String(error)));
  }
  return undefined;
}

function getTypeScriptInstance(
  loaderOptions: LoaderOptions,
  loader: webpack.LoaderContext<LoaderOptions>,
) {
  const existing = getTSInstanceFromCache(
    loader._compiler!,
    loaderOptions.instance,
  );
  if (existing) {
    return existing;
  }

  const colors = createColors(loaderOptions.colors);
  const log = logger.makeLogger({
    logLevel: loaderOptions.logLevel,
    logInfoToStdOut: loaderOptions.logInfoToStdOut,
    silent: loaderOptions.silent,
    colors,
  });
  const configFilePath = resolveConfigFilePath(
    path.dirname(loader.resourcePath),
    loaderOptions.configFile,
  );

  if (!configFilePath) {
    throw new Error(
      `Could not find TypeScript config file '${loaderOptions.configFile}' from '${loader.resourcePath}'.`,
    );
  }

  const files: TSInstance['files'] = new Map();
  const resolvedFilePathCache = createResolvedFilePathCache(loaderOptions);

  const instance: TSInstance = {
    version: 0,
    colors,
    loaderOptions,
    files,
    resolvedFilePathCache,
    typeScriptApiInstance: createTypeScriptInstance(
      loaderOptions,
      configFilePath,
      files,
      resolvedFilePathCache,
    ),
    pendingDiagnostics: new Map(),
    pendingDeclarationFiles: new Map(),
  };

  if (loaderUtils.isWebpack5) {
    loader.addBuildDependency(configFilePath);
  } else {
    loader.addDependency(configFilePath);
  }

  // Captured now rather than read as `loader._compiler` from inside the hook
  // callback below: `loader` is this one loader invocation's short-lived
  // context, torn down well before a later rebuild's `compile` fires, but
  // the `Compiler` it currently points to is the same long-lived instance
  // for the whole watch session - only the reference needs capturing early,
  // its `modifiedFiles`/`removedFiles` are still read fresh on every fire.
  const compiler = loader._compiler!;

  // Only the first file compiled in a given build needs to tell the API
  // which files might be stale in its view (see `pendingInvalidation`/
  // `pendingChangedFiles`/`pendingRemovedFiles` in typeScriptApi.ts);
  // `compile` fires once per build/watch rebuild in both webpack 4 and 5, so
  // tap it to re-arm that ahead of every rebuild.
  compiler.hooks.compile.tap('ts-loader', () => {
    // Webpack 5's watcher already knows exactly which files changed/were
    // removed since the last build - both are `undefined` only for the very
    // first build (nothing to compare against yet) or on webpack 4 (no
    // equivalent API), which is when a full rescan is genuinely needed.
    if (
      loaderUtils.isWebpack5 &&
      (compiler.modifiedFiles !== undefined ||
        compiler.removedFiles !== undefined)
    ) {
      instance.typeScriptApiInstance.pendingChangedFiles =
        compiler.modifiedFiles;
      instance.typeScriptApiInstance.pendingRemovedFiles =
        compiler.removedFiles;
    } else {
      instance.typeScriptApiInstance.pendingInvalidation = true;
    }
  });

  // The typeScript API instance holds a live `tsgo` child process (see
  // typeScriptApi.ts's createTypeScriptInstance) that nothing else kills:
  // it's spawned per instance, not per file, and the instance cache is a
  // WeakMap keyed on the compiler, so leaving this untapped leaks one native
  // process per compiler for as long as the Node process runs. `watchClose`
  // covers a watcher's own teardown; `shutdown` (webpack 5 only - webpack 4
  // has no `compiler.close()`/`shutdown` hook) covers the one-shot
  // run/close pattern.
  const disposeTypeScriptApiInstance = () => {
    try {
      instance.typeScriptApiInstance.api.close();
    } catch {
      // The child process may already be gone (crashed, OOM-killed, or
      // otherwise reaped) - close() talks to it one last time to shut it
      // down cleanly, and that call throws like any other request does once
      // the pipe is dead (see updateSnapshot's own callers). There's nothing
      // left to preserve at this point; letting this escape would crash the
      // whole webpack process on an otherwise-unrelated watcher teardown.
      log.logInfo(
        'failed to close TypeScript API child process, it may have already been closed',
      );
    }
  };
  compiler.hooks.watchClose.tap('ts-loader', disposeTypeScriptApiInstance);
  if (loaderUtils.isWebpack5) {
    compiler.hooks.shutdown.tap('ts-loader', disposeTypeScriptApiInstance);
  }

  if (!loaderOptions.transpileOnly) {
    addPostCompileHooks(loader, instance);
  }

  setTSInstanceInCache(compiler, loaderOptions.instance, instance);
  log.logInfo(
    `Using ${loaderOptions.compiler} typeScript API with ${configFilePath}`,
  );
  return instance;
}

/**
 * Diagnostics/declaration files for non-transpileOnly compiles are gathered
 * per-file but attached only once webpack finishes building every module
 * (see reportPendingTypeScriptDiagnostics/emitPendingDeclarationFiles),
 * matching classic ts-loader's afterCompile timing.
 *
 * Webpack 5 deprecated `afterCompile` reporting for `processAssets`; since
 * `compiler.hooks.compilation` only fires for compilations created *after*
 * this tap is registered, the current one (`loader._compilation`) needs
 * wiring up directly too. Webpack 4 has no `processAssets`, so it uses
 * `afterCompile` directly, which already fires once per compilation.
 */
function addPostCompileHooks(
  loader: webpack.LoaderContext<LoaderOptions>,
  instance: TSInstance,
) {
  const report = (compilation: webpack.Compilation) => {
    if (!compilation.compiler.isChild()) {
      recheckAllTransitiveDependants(instance, compilation);
      reportPendingTypeScriptDiagnostics(instance, compilation);
      emitPendingDeclarationFiles(instance, compilation);
    }
  };

  if (loaderUtils.isWebpack5) {
    const attachToCompilation = (compilation: webpack.Compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'ts-loader',
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => report(compilation),
      );
    };

    attachToCompilation(loader._compilation!);
    loader._compiler!.hooks.compilation.tap('ts-loader', attachToCompilation);
  } else {
    loader._compiler!.hooks.afterCompile.tapAsync(
      'ts-loader',
      (compilation, callback) => {
        report(compilation);
        callback();
      },
    );
  }
}

function createResolvedFilePathCache(
  loaderOptions: LoaderOptions,
): ResolvedFilePathCache {
  const resolvedPathCache = new Map<string, FilePath>();
  const fileNameLowerCaseRegExp = /[^\u0130\u0131\u00DFa-z0-9\\/:\-_. ]+/g;
  const useCaseSensitiveFileNames =
    loaderOptions.useCaseSensitiveFileNames ?? process.platform !== 'win32';

  return useCaseSensitiveFileNames ? pathResolve : toFileNameLowerCase;

  function pathResolve(filePath: string): FilePath {
    let cachedPath = resolvedPathCache.get(filePath);
    if (cachedPath === undefined) {
      cachedPath = path.resolve(filePath) as FilePath;
      resolvedPathCache.set(filePath, cachedPath);
    }
    return cachedPath;
  }

  function toFileNameLowerCase(filePath: string): FilePath {
    let cachedPath = resolvedPathCache.get(filePath);
    if (cachedPath === undefined) {
      const resolvedPath = path.resolve(filePath);
      cachedPath = (
        fileNameLowerCaseRegExp.test(resolvedPath)
          ? resolvedPath.replace(fileNameLowerCaseRegExp, ch =>
              ch.toLowerCase(),
            )
          : resolvedPath
      ) as FilePath;
      resolvedPathCache.set(filePath, cachedPath);
    }
    return cachedPath;
  }
}

function resolveConfigFilePath(requestDirPath: string, configFile: string) {
  if (path.isAbsolute(configFile)) {
    return fs.existsSync(configFile) ? configFile : undefined;
  }

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
      return undefined;
    }
    requestDirPath = parentPath;
  }
}

type ValidLoaderOptions = keyof LoaderOptions;
const validLoaderOptions: ValidLoaderOptions[] = [
  'silent',
  'logLevel',
  'logInfoToStdOut',
  'instance',
  'compiler',
  'configFile',
  'transpileOnly',
  'ignoreDiagnostics',
  'errorFormatter',
  'colors',
  'appendTsSuffixTo',
  'appendTsxSuffixTo',
  'getCustomTransformers',
  'reportFiles',
  'allowTsInNodeModules',
  'projectReferences',
  // Accepted for backwards compatibility but currently inert: the
  // `typescript/unstable/sync` (tsgo) API this loader now runs on only
  // exposes filesystem-level hooks, not a resolveModuleName-style custom
  // resolver hook. See test/execution-tests/3.0.1_resolveModuleName.
  'resolveModuleName',
  'resolveTypeReferenceDirective',
  'useCaseSensitiveFileNames',
];

function validateLoaderOptions(loaderOptions: LoaderOptions) {
  const loaderOptionKeys = Object.keys(loaderOptions);
  for (let i = 0; i < loaderOptionKeys.length; i++) {
    const option = loaderOptionKeys[i];
    const isUnexpectedOption =
      (validLoaderOptions as string[]).indexOf(option) === -1;
    if (isUnexpectedOption) {
      throw new Error(`ts-loader was supplied with an unexpected loader option: ${option}

Please take a look at the options you are supplying; the following are valid options:
${validLoaderOptions.join(' / ')}
`);
    }
  }
}

function getOptionsHash(loaderOptions: LoaderOptions) {
  const hash = crypto.createHash('sha256');
  Object.keys(loaderOptions).forEach(key => {
    const value = loaderOptions[key as keyof LoaderOptions];
    if (value !== undefined) {
      const valueString =
        typeof value === 'function' ? value.toString() : JSON.stringify(value);
      hash.update(key + valueString);
    }
  });
  return hash.digest('hex').substring(0, 16);
}

function getLoaderOptions(loaderContext: webpack.LoaderContext<LoaderOptions>) {
  const loaderOptions = loaderUtils.getOptions(loaderContext);

  const instanceName =
    loaderOptions.instance || 'default_' + getOptionsHash(loaderOptions);

  if (!loaderOptionsCache.hasOwnProperty(instanceName)) {
    loaderOptionsCache[instanceName] = new WeakMap();
  }

  const cache = loaderOptionsCache[instanceName];

  if (cache.has(loaderOptions)) {
    return cache.get(loaderOptions) as LoaderOptions;
  }

  validateLoaderOptions(loaderOptions);

  const hasForkTsCheckerWebpackPlugin =
    loaderContext._compiler?.options.plugins?.some(
      plugin =>
        plugin !== null &&
        typeof plugin === 'object' &&
        plugin.constructor?.name === 'ForkTsCheckerWebpackPlugin',
    ) ?? false;

  const options = Object.assign(
    {},
    {
      silent: false,
      logLevel: 'WARN' as keyof typeof LogLevel,
      logInfoToStdOut: false,
      compiler: 'typescript',
      transpileOnly: hasForkTsCheckerWebpackPlugin,
      appendTsSuffixTo: [],
      appendTsxSuffixTo: [],
      colors: true,
      reportFiles: [],
      allowTsInNodeModules: false,
      ignoreDiagnostics: [] as number[],
    } satisfies Partial<LoaderOptions>,
    loaderOptions,
  );

  options.ignoreDiagnostics = arrify(options.ignoreDiagnostics).map(Number);
  options.logLevel = options.logLevel.toUpperCase() as keyof typeof LogLevel;
  options.instance = instanceName;
  options.configFile = options.configFile || 'tsconfig.json';

  cache.set(loaderOptions, options);

  return options;
}

function updateFileInCache(
  filePath: string,
  contents: string,
  instance: TSInstance,
) {
  const resolvedPath = instance.resolvedFilePathCache(filePath);
  let file: TSFile | undefined = instance.files.get(resolvedPath);

  if (file === undefined) {
    // No "don't compile this" step needed for a disallowed node_modules
    // file here: the API already skips emit for files it considers part of
    // an external library, surfaced instead as makeSourceMapAndFinish's
    // "TypeScript emitted no output" error below.
    file = { fileName: filePath, version: 0 };
    instance.files.set(resolvedPath, file);
    instance.version++;
  }

  if (file.text !== contents) {
    file.version++;
    file.text = contents;
    instance.version++;
  }

  return file.version;
}

function appendSuffixesIfRequired(filePath: string, options: LoaderOptions) {
  return (
    appendSuffixIfMatch(options.appendTsSuffixTo, filePath, '.ts') ||
    appendSuffixIfMatch(options.appendTsxSuffixTo, filePath, '.tsx') ||
    filePath
  );
}

function appendSuffixIfMatch(
  patterns: (RegExp | string)[],
  filePath: string,
  suffix: string,
) {
  if (patterns.length > 0) {
    for (const regexp of patterns) {
      if (filePath.match(regexp) !== null) {
        return filePath + suffix;
      }
    }
  }

  return undefined;
}

function arrify<T>(value: T | T[] | undefined) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function makeSourceMapAndFinish(
  sourceMapText: string | undefined,
  outputText: string | undefined,
  filePath: string,
  contents: string,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  fileVersion: number,
  callback: ReturnType<webpack.LoaderContext<LoaderOptions>['async']>,
  allowTsInNodeModules: boolean,
  inputSourceMap?: Record<string, unknown>,
) {
  if (outputText === null || outputText === undefined) {
    setModuleMeta(loaderContext, fileVersion);
    // A file under node_modules is the most common cause: the API skips
    // emit for a source file it considers part of an external library,
    // matching classic ts-loader's guidance for the same situation.
    const additionalGuidance =
      !allowTsInNodeModules && filePath.indexOf('node_modules') !== -1
        ? ' By default, ts-loader will not compile .ts files in node_modules.\n' +
          'You should not need to recompile .ts files there, but if you really want to, use the allowTsInNodeModules option.\n' +
          'See: https://github.com/Microsoft/TypeScript/issues/12358'
        : '';
    callback(
      new Error(
        `TypeScript emitted no output for ${filePath}.${additionalGuidance}`,
      ),
      outputText,
      undefined,
    );
    return;
  }

  const { sourceMap, output } = makeSourceMap(
    sourceMapText,
    outputText,
    filePath,
    contents,
    loaderContext,
  );

  setModuleMeta(loaderContext, fileVersion);

  if (sourceMap === undefined || !inputSourceMap || !canUseSourceMapConsumer) {
    callback(null, output, sourceMap);
    return;
  }

  mapToInputSourceMap(
    sourceMap,
    loaderContext,
    inputSourceMap as unknown as RawSourceMap,
  )
    .then(mappedSourceMap => {
      callback(null, output, mappedSourceMap);
    })
    .catch((e: Error) => {
      callback(e);
    });
}

function setModuleMeta(
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  fileVersion: number,
) {
  if (loaderContext._module?.buildMeta !== undefined) {
    loaderContext._module.buildMeta.tsLoaderFileVersion = fileVersion;
  }
}

function makeSourceMap(
  sourceMapText: string | undefined,
  outputText: string,
  filePath: string,
  contents: string,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
) {
  if (sourceMapText === undefined) {
    return { output: outputText, sourceMap: undefined };
  }

  return {
    output: outputText.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, ''),
    sourceMap: Object.assign(JSON.parse(sourceMapText), {
      sources: [loaderContext.remainingRequest],
      file: filePath,
      sourcesContent: [contents],
    }),
  };
}

function mapToInputSourceMap(
  sourceMap: RawSourceMap,
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  inputSourceMap: RawSourceMap,
): Promise<RawSourceMap> {
  return new Promise<RawSourceMap>((resolve, reject) => {
    const inMap: RawSourceMap = {
      file: loaderContext.remainingRequest,
      mappings: inputSourceMap.mappings,
      names: inputSourceMap.names,
      sources: inputSourceMap.sources,
      sourceRoot: inputSourceMap.sourceRoot,
      sourcesContent: inputSourceMap.sourcesContent,
      version: inputSourceMap.version,
    };
    Promise.all([
      new SourceMapConsumer(inMap),
      new SourceMapConsumer(sourceMap),
    ])
      .then(sourceMapConsumers => {
        try {
          const generator = SourceMapGenerator.fromSourceMap(
            sourceMapConsumers[1],
          );
          generator.applySourceMap(sourceMapConsumers[0]);
          const mappedSourceMap = generator.toJSON();

          sourceMapConsumers.forEach(sourceMapConsumer =>
            sourceMapConsumer.destroy(),
          );
          resolve(mappedSourceMap);
        } catch (e) {
          sourceMapConsumers.forEach(sourceMapConsumer =>
            sourceMapConsumer.destroy(),
          );
          reject(e);
        }
      })
      .catch(reject);
  });
}

export = loader;

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace loader {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface Options extends LoaderOptions {}
}
