import { 
    Resolve,
    ResolveSync
} from './interfaces';

const node = require("enhanced-resolve/lib/node");

export function makeResolver(options: { resolve: Resolve }): ResolveSync {
    return node.create.sync(options.resolve);
}

