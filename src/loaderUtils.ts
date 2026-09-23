import * as webpack from 'webpack';

import type { FileLocation, LoaderOptions } from './types';

export const isWebpack5 = webpack.version.startsWith('5.');

interface LoaderUtilsModule {
  getOptions<T>(loaderContext: { query: string }): T;
}
let loaderUtils: LoaderUtilsModule | undefined;

export function getOptions(
  loaderContext: webpack.LoaderContext<LoaderOptions>,
) {
  if (isWebpack5) {
    return loaderContext.getOptions();
  }

  if (!loaderUtils) {
    try {
      loaderUtils = module.require('loader-utils') as LoaderUtilsModule;
    } catch {
      throw new Error(
        'ts-loader requires loader-utils to be installed when used with webpack 4.',
      );
    }
  }

  return (
    loaderUtils.getOptions<LoaderOptions>(loaderContext as never) ||
    ({} as LoaderOptions)
  );
}

export function addErrorToModule(
  module: webpack.Module,
  error: webpack.WebpackError,
) {
  if (isWebpack5) {
    module.addError(error);
  } else {
    module.errors.push(error);
  }
}

export function makeError(
  loaderOptions: LoaderOptions,
  message: string,
  file: string,
  location?: FileLocation,
  endLocation?: FileLocation,
): webpack.WebpackError {
  if (isWebpack5) {
    const error = new webpack.WebpackError(message);
    error.file = file;
    error.loc =
      location === undefined
        ? { name: file }
        : makeWebpackLocation(location, endLocation);
    error.details = tsLoaderSource(loaderOptions);

    return error;
  }

  return {
    message,
    file,
    loc:
      location === undefined
        ? undefined
        : makeWebpackLocation(location, endLocation),
    location,
    details: tsLoaderSource(loaderOptions),
  } as unknown as webpack.WebpackError;
}

interface WebpackSourcePosition {
  line: number;
  column?: number;
}

function makeWebpackLocation(
  location: FileLocation,
  endLocation?: FileLocation,
) {
  const start: WebpackSourcePosition = {
    line: location.line,
    column: location.character - 1,
  };
  const end: WebpackSourcePosition | undefined =
    endLocation === undefined
      ? undefined
      : { line: endLocation.line, column: endLocation.character - 1 };
  return { start, end };
}

export function tsLoaderSource(loaderOptions: LoaderOptions) {
  return `ts-loader-${loaderOptions.instance}`;
}
