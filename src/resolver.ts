import { Resolve, ResolveSync } from './interfaces';

// tslint:disable-next-line:no-submodule-imports
const node = require('enhanced-resolve/lib/node');

export function makeResolver(options: { resolve: Resolve }): ResolveSync {
  return node.create.sync(options.resolve);
}
