import type * as webpack from 'webpack';

import type { LoaderOptions } from './interfaces';

interface LoaderUtilsModule {
  getOptions<T>(loaderContext: { query: string }): T;
};
let loaderUtils: LoaderUtilsModule | undefined;

export function getWebpack4LoaderOptions(
  loaderContext: webpack.LoaderContext<LoaderOptions>
) {
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
