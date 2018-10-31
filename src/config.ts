import { Chalk } from 'chalk';
import * as path from 'path';
import * as typescript from 'typescript';
import { LoaderOptions, Webpack, WebpackError } from './interfaces';
import * as logger from './logger';
import { formatErrors } from './utils';

interface ConfigFile {
  config?: any;
  error?: typescript.Diagnostic;
}

export function getConfigFile(
  compiler: typeof typescript,
  colors: Chalk,
  loader: Webpack,
  loaderOptions: LoaderOptions,
  compilerCompatible: boolean,
  log: logger.Logger,
  compilerDetailsLogMessage: string
) {
  const configFilePath = findConfigFile(
    loader,
    compiler,
    path.dirname(loader.resourcePath),
    loaderOptions.configFile
  );
  let configFileError: WebpackError | undefined;
  let configFile: ConfigFile;

  if (configFilePath !== undefined) {
    if (compilerCompatible) {
      log.logInfo(`${compilerDetailsLogMessage} and ${configFilePath}`);
    } else {
      log.logInfo(`ts-loader: Using config file at ${configFilePath}`);
    }

    const readFile = (filePath: string, encoding: string = "utf8") => {
      try {
        return loader.fs.readFileSync(filePath, { encoding });
      } catch (e) {
        return compiler.sys.readFile(filePath, encoding);
      }
    }
    configFile = compiler.readConfigFile(configFilePath, readFile);

    if (configFile.error !== undefined) {
      configFileError = formatErrors(
        [configFile.error],
        loaderOptions,
        colors,
        compiler,
        { file: configFilePath },
        loader.context
      )[0];
    }
  } else {
    if (compilerCompatible) {
      log.logInfo(compilerDetailsLogMessage);
    }

    configFile = {
      config: {
        compilerOptions: {},
        files: []
      }
    };
  }

  if (configFileError === undefined) {
    configFile.config.compilerOptions = Object.assign(
      {},
      configFile.config.compilerOptions,
      loaderOptions.compilerOptions
    );
  }

  return {
    configFilePath,
    configFile,
    configFileError
  };
}

/**
 * Find a tsconfig file by name or by path.
 * By name, the tsconfig.json is found using the same method as `tsc`, starting in the current
 * directory and continuing up the parent directory chain.
 * By path, the file will be found by resolving the given path relative to the requesting entry file.
 *
 * @param compiler The TypeScript compiler instance
 * @param requestDirPath The directory in which the entry point requesting the tsconfig.json lies
 * @param configFile The tsconfig file name to look for or a path to that file
 * @return The absolute path to the tsconfig file, undefined if none was found.
 */
function findConfigFile(
  loader: Webpack,
  compiler: typeof typescript,
  requestDirPath: string,
  configFile: string
): string | undefined {
  const fileExists = (fileName: string) => loader.fs.existsSync(fileName) || compiler.sys.fileExists(fileName);

  // If `configFile` is an absolute path, return it right away
  if (path.isAbsolute(configFile)) {
    return fileExists(configFile) ? configFile : undefined;
  }

  // If `configFile` is a relative path, resolve it.
  // We define a relative path as: starts with
  // one or two dots + a common directory delimiter
  if (configFile.match(/^\.\.?(\/|\\)/) !== null) {
    const resolvedPath = path.resolve(requestDirPath, configFile);
    return fileExists(resolvedPath) ? resolvedPath : undefined;

    // If `configFile` is a file name, find it in the directory tree
  } else {
    while (true) {
      const fileName = path.join(requestDirPath, configFile);
      if (fileExists(fileName)) {
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
}

export function getConfigParseResult(
  compiler: typeof typescript,
  configFile: ConfigFile,
  basePath: string
) {
  const configParseResult = compiler.parseJsonConfigFileContent(
    configFile.config,
    compiler.sys,
    basePath
  );

  return configParseResult;
}
