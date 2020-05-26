import * as webpack from 'webpack';

import { ResolveSync } from './interfaces';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const node = require('enhanced-resolve/lib/node');

export function makeResolver(options: webpack.Configuration): ResolveSync {
  return node.create.sync(options.resolve);
}
