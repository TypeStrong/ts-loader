import type * as webpack from 'webpack';

import { create } from 'enhanced-resolve';
import { LoaderOptions } from './interfaces';

export function makeResolver(
  options: webpack.WebpackOptionsNormalized,
  fs: webpack.LoaderContext<LoaderOptions>['fs']
): ResolveSync {
  const resolveOptions = options.resolve;
  return create.sync({
    ...resolveOptions,
    fileSystem: fs,
  });
}

export type ResolveSync = (
  context: string | undefined,
  path: string,
  moduleName: string
) => string | false;
