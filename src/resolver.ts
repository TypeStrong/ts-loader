import type * as webpack from 'webpack';

import { create } from 'enhanced-resolve';

export function makeResolver(
  options: webpack.WebpackOptionsNormalized
): ResolveSync {
  return create.sync(options.resolve);
}

export type ResolveSync = {
  (context: any, path: string, moduleName: string): string | false;
  (path: string, moduleName: string): string | false;
};
