// This file serves as a hacky workaround for the lack of "resolveSync" support in webpack.
// We make our own resolver using a sync file system but using the same plugins & options
// that webpack does.
import interfaces = require('./interfaces');

var Resolver = require("enhanced-resolve/lib/Resolver");
var SyncNodeJsInputFileSystem = require("enhanced-resolve/lib/SyncNodeJsInputFileSystem");
var CachedInputFileSystem = require("enhanced-resolve/lib/CachedInputFileSystem");
var UnsafeCachePlugin = require("enhanced-resolve/lib/UnsafeCachePlugin");
var ModulesInDirectoriesPlugin = require("enhanced-resolve/lib/ModulesInDirectoriesPlugin");
var ModulesInRootPlugin = require("enhanced-resolve/lib/ModulesInRootPlugin");
var ModuleAsFilePlugin = require("enhanced-resolve/lib/ModuleAsFilePlugin");
var ModuleAsDirectoryPlugin = require("enhanced-resolve/lib/ModuleAsDirectoryPlugin");
var ModuleAliasPlugin = require("enhanced-resolve/lib/ModuleAliasPlugin");
var DirectoryDefaultFilePlugin = require("enhanced-resolve/lib/DirectoryDefaultFilePlugin");
var DirectoryDescriptionFilePlugin = require("enhanced-resolve/lib/DirectoryDescriptionFilePlugin");
var DirectoryDescriptionFileFieldAliasPlugin = require("enhanced-resolve/lib/DirectoryDescriptionFileFieldAliasPlugin");
var FileAppendPlugin = require("enhanced-resolve/lib/FileAppendPlugin");
var ResultSymlinkPlugin = require("enhanced-resolve/lib/ResultSymlinkPlugin");

function makeRootPlugin(name: string, root: string | string[]) {
	if(typeof root === "string")
		return new ModulesInRootPlugin(name, root);
	else if(Array.isArray(root)) {
		return function() {
			root.forEach(function(root) {
				this.apply(new ModulesInRootPlugin(name, root));
			}, this);
		};
	}
	return function() {};
}

function makeResolver(options: { resolve: interfaces.Resolve }) {
	let fileSystem = new CachedInputFileSystem(new SyncNodeJsInputFileSystem(), 60000);

    let resolver = new Resolver(fileSystem);
	
	// apply the same plugins that webpack does, see webpack/lib/WebpackOptionsApply.js
	resolver.apply(
		new UnsafeCachePlugin(options.resolve.unsafeCache),
		options.resolve.packageAlias ? new DirectoryDescriptionFileFieldAliasPlugin("package.json", options.resolve.packageAlias) : function() {},
		new ModuleAliasPlugin(options.resolve.alias),
		makeRootPlugin("module", options.resolve.root),
		new ModulesInDirectoriesPlugin("module", options.resolve.modulesDirectories),
		makeRootPlugin("module", options.resolve.fallback),
		new ModuleAsFilePlugin("module"),
		new ModuleAsDirectoryPlugin("module"),
		new DirectoryDescriptionFilePlugin("package.json", options.resolve.packageMains),
		new DirectoryDefaultFilePlugin(["index"]),
		new FileAppendPlugin(options.resolve.extensions),
		new ResultSymlinkPlugin()
	);
	
	return resolver;
}

export = makeResolver;