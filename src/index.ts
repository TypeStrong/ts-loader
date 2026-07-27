import * as chalk from 'chalk';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type * as webpack from 'webpack';

import { createNativeInstance, getNativeEmit } from './native';
import type {
  FilePathKey,
  LoaderOptions,
  LoaderOptionsCache,
  LogLevel,
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
  inputSourceMap?: Record<string, unknown>
) {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  this.cacheable && this.cacheable();
  const callback = this.async();
  runLoader(this, contents, inputSourceMap, callback);
}

function runLoader(
  loaderContext: webpack.LoaderContext<LoaderOptions>,
  contents: string,
  inputSourceMap: Record<string, unknown> | undefined,
  callback: ReturnType<webpack.LoaderContext<LoaderOptions>['async']>
) {
  try {
    const options = getLoaderOptions(loaderContext);
    const instance = getTypeScriptInstance(options, loaderContext);
    const rawFilePath = path.normalize(loaderContext.resourcePath);
    const filePath = appendSuffixesIfRequired(rawFilePath, options);
    const fileVersion = updateFileInCache(options, filePath, contents, instance);
    const { outputText, sourceMapText } = getNativeEmit(
      filePath,
      contents,
      instance,
      loaderContext
    );

    makeSourceMapAndFinish(
      sourceMapText,
      outputText,
      filePath,
      contents,
      loaderContext,
      fileVersion,
      callback,
      instance,
      inputSourceMap
    );
  } catch (error) {
    callback(error instanceof Error ? error : new Error(String(error)));
  }
}

function getTypeScriptInstance(
  loaderOptions: LoaderOptions,
  loader: webpack.LoaderContext<LoaderOptions>
) {
  const existing = getTSInstanceFromCache(
    loader._compiler!,
    loaderOptions.instance
  );
  if (existing) {
    return existing;
  }

  const level =
    loaderOptions.colors && chalk.supportsColor ? chalk.supportsColor.level : 0;
  const colors = new chalk.Instance({ level });
  const log = logger.makeLogger(loaderOptions, colors);
  const configFilePath = resolveConfigFilePath(
    path.dirname(loader.resourcePath),
    loaderOptions.configFile
  );

  if (!configFilePath) {
    throw new Error(
      `Could not find TypeScript config file '${loaderOptions.configFile}' from '${loader.resourcePath}'.`
    );
  }

  const instance: TSInstance = {
    version: 0,
    colors,
    log,
    loaderOptions,
    files: new Map(),
    configFilePath,
    filePathKeyMapper: createFilePathKeyMapper(loaderOptions),
    nativeInstance: createNativeInstance(loaderOptions, configFilePath),
  };

  if (loaderUtils.isWebpack5) {
    loader.addBuildDependency(configFilePath);
  } else {
    loader.addDependency(configFilePath);
  }

  setTSInstanceInCache(loader._compiler, loaderOptions.instance, instance);
  log.logInfo(
    `ts-loader: Using ${loaderOptions.compiler} native API with ${configFilePath}`
  );
  return instance;
}

function createFilePathKeyMapper(loaderOptions: LoaderOptions) {
  const filePathMapperCache = new Map<string, FilePathKey>();
  const fileNameLowerCaseRegExp = /[^\u0130\u0131\u00DFa-z0-9\\/:\-_. ]+/g;
  const useCaseSensitiveFileNames =
    loaderOptions.useCaseSensitiveFileNames ?? process.platform !== 'win32';

  return useCaseSensitiveFileNames ? pathResolve : toFileNameLowerCase;

  function pathResolve(filePath: string) {
    let cachedPath = filePathMapperCache.get(filePath);
    if (!cachedPath) {
      cachedPath = path.resolve(filePath) as FilePathKey;
      filePathMapperCache.set(filePath, cachedPath);
    }
    return cachedPath;
  }

  function toFileNameLowerCase(filePath: string) {
    let cachedPath = filePathMapperCache.get(filePath);
    if (!cachedPath) {
      const filePathKey = pathResolve(filePath);
      cachedPath = fileNameLowerCaseRegExp.test(filePathKey)
        ? (filePathKey.replace(fileNameLowerCaseRegExp, ch =>
            ch.toLowerCase()
          ) as FilePathKey)
        : filePathKey;
      filePathMapperCache.set(filePath, cachedPath);
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
  'context',
  'configFile',
  'transpileOnly',
  'ignoreDiagnostics',
  'errorFormatter',
  'colors',
  'compilerOptions',
  'appendTsSuffixTo',
  'appendTsxSuffixTo',
  'onlyCompileBundledFiles',
  'happyPackMode',
  'getCustomTransformers',
  'reportFiles',
  'experimentalWatchApi',
  'allowTsInNodeModules',
  'experimentalFileCaching',
  'projectReferences',
  'resolveModuleName',
  'resolveTypeReferenceDirective',
  'useCaseSensitiveFileNames',
  'experimentalNativeApi',
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

  if (
    loaderOptions.context !== undefined &&
    !path.isAbsolute(loaderOptions.context)
  ) {
    throw new Error(
      `Option 'context' has to be an absolute path. Given '${loaderOptions.context}'.`
    );
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

function getLoaderOptions(
  loaderContext: webpack.LoaderContext<LoaderOptions>
) {
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
        plugin.constructor?.name === 'ForkTsCheckerWebpackPlugin'
    ) ?? false;

  const options = Object.assign(
    {},
    {
      silent: false,
      logLevel: 'WARN',
      logInfoToStdOut: false,
      compiler: 'typescript',
      context: undefined,
      transpileOnly: hasForkTsCheckerWebpackPlugin,
      compilerOptions: {},
      appendTsSuffixTo: [],
      appendTsxSuffixTo: [],
      happyPackMode: false,
      colors: true,
      onlyCompileBundledFiles: false,
      reportFiles: [],
      experimentalWatchApi: false,
      allowTsInNodeModules: false,
      experimentalFileCaching: true,
      experimentalNativeApi: true,
      ignoreDiagnostics: [],
    } as Partial<LoaderOptions>,
    loaderOptions
  );

  options.ignoreDiagnostics = arrify(options.ignoreDiagnostics).map(Number);
  options.logLevel = options.logLevel.toUpperCase() as LogLevel;
  options.instance = instanceName;
  options.configFile = options.configFile || 'tsconfig.json';
  options.transpileOnly = options.happyPackMode ? true : options.transpileOnly;

  cache.set(loaderOptions, options);

  return options;
}

function updateFileInCache(
  options: LoaderOptions,
  filePath: string,
  contents: string,
  instance: TSInstance
) {
  const key = instance.filePathKeyMapper(filePath);
  let file: TSFile | undefined = instance.files.get(key);

  if (file === undefined) {
    if (!options.allowTsInNodeModules && filePath.indexOf('node_modules') !== -1) {
      throw new Error(
        `TypeScript source in node_modules is not compiled by default: ${filePath}`
      );
    }

    file = { fileName: filePath, version: 0 };
    instance.files.set(key, file);
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
  return appendSuffixIfMatch(options.appendTsSuffixTo, filePath, '.ts')
    || appendSuffixIfMatch(options.appendTsxSuffixTo, filePath, '.tsx')
    || filePath;
}

function appendSuffixIfMatch(
  patterns: (RegExp | string)[],
  filePath: string,
  suffix: string
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
  instance: TSInstance,
  inputSourceMap?: Record<string, unknown>
) {
  if (outputText === null || outputText === undefined) {
    setModuleMeta(loaderContext, instance, fileVersion);
    callback(
      new Error(`TypeScript emitted no output for ${filePath}.`),
      outputText,
      undefined
    );
    return;
  }

  const { sourceMap, output } = makeSourceMap(
    sourceMapText,
    outputText,
    filePath,
    contents,
    loaderContext
  );

  setModuleMeta(loaderContext, instance, fileVersion);

  if (sourceMap === undefined || !inputSourceMap || !canUseSourceMapConsumer) {
    callback(null, output, sourceMap);
    return;
  }

  mapToInputSourceMap(
    sourceMap,
    loaderContext,
    inputSourceMap as unknown as RawSourceMap
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
  instance: TSInstance,
  fileVersion: number
) {
  if (
    !instance.loaderOptions.happyPackMode &&
    loaderContext._module?.buildMeta !== undefined
  ) {
    loaderContext._module.buildMeta.tsLoaderFileVersion = fileVersion;
  }
}

function makeSourceMap(
  sourceMapText: string | undefined,
  outputText: string,
  filePath: string,
  contents: string,
  loaderContext: webpack.LoaderContext<LoaderOptions>
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
  inputSourceMap: RawSourceMap
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
    Promise.all([new SourceMapConsumer(inMap), new SourceMapConsumer(sourceMap)])
      .then(sourceMapConsumers => {
        try {
          const generator = SourceMapGenerator.fromSourceMap(
            sourceMapConsumers[1]
          );
          generator.applySourceMap(sourceMapConsumers[0]);
          const mappedSourceMap = generator.toJSON();

          sourceMapConsumers.forEach(sourceMapConsumer =>
            sourceMapConsumer.destroy()
          );
          resolve(mappedSourceMap);
        } catch (e) {
          sourceMapConsumers.forEach(sourceMapConsumer =>
            sourceMapConsumer.destroy()
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
