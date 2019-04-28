import * as webpack from 'webpack';

import { ResolveSync } from './interfaces';

// tslint:disable-next-line:no-submodule-imports
const node = require('enhanced-resolve/lib/node');

export function makeResolver(options: webpack.Configuration): ResolveSync {
  return node.create.sync(options.resolve);
}
