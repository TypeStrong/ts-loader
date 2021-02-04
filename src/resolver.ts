import * as webpack from 'webpack';

import { create } from 'enhanced-resolve';

export function makeResolver(options: webpack.Configuration) {
  return create.sync(options.resolve);
}
