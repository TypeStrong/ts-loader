import interfaces = require('./interfaces');

const node = require("enhanced-resolve/lib/node");

function makeResolver(options: { resolve: interfaces.Resolve }): interfaces.ResolveSync {
    return node.create.sync(options.resolve);
}

export = makeResolver;
