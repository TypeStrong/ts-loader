
/** Based on https://www.npmjs.com/package/declaration-bundler-webpack-plugin - the original is broken due to a webpack api change and unmaintained.
 * Typescript outputs a .d.ts file for every .ts file. This plugin just combines them. Typescript itself *can* combine them, but then you don't get the
 * benefits of webpack. */
import {
    Compiler, WebpackCompilation, DeclarationBundleOptions
} from './interfaces';

class DeclarationBundlerPlugin {
    constructor(options: DeclarationBundleOptions = <any>{}) {
        if (!options.moduleName) {
            throw new Error('declarationBundle.moduleName is required');
        }
        this.moduleName = options.moduleName;
        this.out = options.out || this.moduleName + '.d.ts';
    }

    out: string;
    moduleName: string;

    apply(compiler: Compiler) {
        compiler.plugin('emit', (compilation: WebpackCompilation, callback: any) => {
            var declarationFiles = {};
            
            for (var filename in compilation.assets) {
                if (filename.indexOf('.d.ts') !== -1) {
                    declarationFiles[filename] = compilation.assets[filename];
                    delete compilation.assets[filename];
                }
            }

            var combinedDeclaration = this.generateCombinedDeclaration(declarationFiles);
            console.log(this.out);
            compilation.assets[this.out] = {
                source: function () {
                    return combinedDeclaration;
                },
                size: function () {
                    return combinedDeclaration.length;
                }
            };

            callback();
        });    
    }

    generateCombinedDeclaration(declarationFiles: any) {
        var declarations = '';
        for (var fileName in declarationFiles) {
            var declarationFile = declarationFiles[fileName];
            var data = declarationFile._value || declarationFile.source();
            
            var lines = data.split("\n");
            
            var i = lines.length;
            while (i--) {
                var line = lines[i];
                var excludeLine = line === ""
                    || line.indexOf("export =") !== -1
                    || (/import ([a-z0-9A-Z_-]+) = require\(/).test(line);

                if (excludeLine) {
                    lines.splice(i, 1);
                } else {
                    if (line.indexOf("declare ") !== -1) {
                        lines[i] = line.replace("declare ", "");
                    }
                    //add tab
                    lines[i] = "\t" + lines[i];
                }
            }
            declarations += lines.join("\n") + "\n\n";
        }
        var output = "declare module " + this.moduleName + "\n{\n" + declarations + "}";
        return output;
    };
}

export default DeclarationBundlerPlugin;
