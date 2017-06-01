var path = require('path');
var ts = require('typescript');

var htmlTypings = `
declare const html: string;
export = html;
`;

function loader(source, sourceMap) {
    var callback = this.async();
    var tsLoaderFiles = this.data['ts-loader-files'];
    var dir = path.dirname(this.resourcePath);

    // Get imports from the TypeScript source
    var imports = ts.preProcessFile(source, true, true).importedFiles || [];

    // Generate typings for imports ending with .foo
    imports.forEach(function (imp) {
        if (/\.html$/.test(imp.fileName)) {
            // The file name for the typings should be <file>.html.d.ts
            var typingsPath = path.resolve(dir, imp.fileName) + '.d.ts';
            // Store the file in this.data['ts-loader-files']
            tsLoaderFiles[typingsPath] = htmlTypings;
        }
    });

    callback(null, source, sourceMap);
}

// The loader needs a pitch function to create data['ts-loader-files']
loader.pitch = function (remainingRequest, precedingRequest, data) {
    data['ts-loader-files'] = data['ts-loader-files'] || {};
}

module.exports = loader;