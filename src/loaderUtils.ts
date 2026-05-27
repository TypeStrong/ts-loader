import * as webpack from 'webpack';

import type { LoaderOptions } from './interfaces';

export const isWebpack5 = webpack.version.startsWith('5.');

interface LoaderUtilsModule {
  getOptions<T>(loaderContext: { query: string }): T;
};
let loaderUtils: LoaderUtilsModule | undefined;

export function getOptions(
  loaderContext: webpack.LoaderContext<LoaderOptions>
) {
  if (isWebpack5) { 
    return loaderContext.getOptions(); 
  }

  if (!loaderUtils) {
    try {
      loaderUtils = module.require('loader-utils') as LoaderUtilsModule;
    } catch {
      throw new Error(
        'ts-loader requires loader-utils to be installed when used with webpack 4.'
      );
    }
  }

  return loaderUtils.getOptions<LoaderOptions>(loaderContext as any) || ({} as LoaderOptions);
}

/**
 * webpack 4 and webpack 5 have different APIs for adding errors to modules. This function abstracts that away.
 */
export function addErrorToModule(module: webpack.Module, error: webpack.WebpackError) {
  if (isWebpack5) {
    module.addError(error);
  } else {
    module.errors.push(error);
  }
}
