import type * as webpack from 'webpack';

import { create } from 'enhanced-resolve';

export function makeResolver(
  options: webpack.WebpackOptionsNormalized
): ResolveSync {
  const resolveOptions = options.resolve;
  const resolver = create.sync(resolveOptions);

  if ('alias' in resolveOptions || 'fallback' in resolveOptions) {
    const neutralOptions = Object.assign({}, resolveOptions);
    delete neutralOptions.alias;
    delete neutralOptions.fallback;
    const neutralResolver = create.sync(neutralOptions);

    return (context, path, moduleName?): string | false => {
      const result = resolver(context, path, moduleName);

      try {
        const neutralResult = neutralResolver(context, path, moduleName);

        if (result !== neutralResult) {
          return result;
        } else {
          return false;
        }
      } catch {
        return result;
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
