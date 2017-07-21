import { 
    Resolve,
    ResolveSync
} from './interfaces';

const node = require("enhanced-resolve/lib/node");

function makeResolver(options: { resolve: Resolve }): ResolveSync {
    return node.create.sync(options.resolve);
}

export = makeResolver;
