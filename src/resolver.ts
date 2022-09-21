import type * as webpack from 'webpack';

import { create } from 'enhanced-resolve';

export function makeResolver(
  options: webpack.WebpackOptionsNormalized
): ResolveSync {
  const resolver = create.sync(options.resolve);

  if ('alias' in options || 'fallback' in options) {
    const neutralOptions = Object.assign({}, options.resolve);
    delete neutralOptions.alias;
    delete neutralOptions.fallback;
    const neutralResolver = create.sync(neutralOptions);

    return (context, path, moduleName?): string | false => {
      const result = resolver(context, path, moduleName);
      const neutralResult = neutralResolver(context, path, moduleName);

      if (result !== neutralResult) {
        return result;
      } else {
        return false;
      }
    };
  } else {
    return () => false;
  }
}

export type ResolveSync = {
  (context: any, path: string, moduleName: string): string | false;
  (path: string, moduleName: string): string | false;
};
