import type * as webpack from 'webpack';

import type { LoaderOptions } from './interfaces';

const requireFromTsLoader = module.require.bind(module) as NodeJS.Require;
type LoaderUtilsModule = {
  getOptions<T>(loaderContext: { query: string }): T;
};
let loaderUtils: LoaderUtilsModule | undefined;

export function getWebpack4LoaderOptions(
  loaderContext: webpack.LoaderContext<LoaderOptions>
) {
  if (!loaderUtils) {
    try {
      loaderUtils = requireFromTsLoader('loader-utils') as LoaderUtilsModule;
    } catch {
      throw new Error(
        'ts-loader requires loader-utils to be installed when used with webpack 4.'
      );
    }
  }

  return loaderUtils.getOptions<LoaderOptions>(loaderContext as any) || ({} as LoaderOptions);
}
