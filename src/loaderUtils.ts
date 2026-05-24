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
