import type * as webpack from 'webpack';

import { create as _create } from 'enhanced-resolve';

export function makeResolver(
  _options: webpack.WebpackOptionsNormalized
): ResolveSync {
  /* Currently, `enhanced-resolve` does not work properly alongside `ts-loader`.
   * This feature is disabled until a proper worflow has been worked out. */
  return (_context, _path, _moduleName?): string | false => {
    throw new Error();
  };
}

export type ResolveSync = {
  (context: any, path: string, moduleName: string): string | false;
  (path: string, moduleName: string): string | false;
};
