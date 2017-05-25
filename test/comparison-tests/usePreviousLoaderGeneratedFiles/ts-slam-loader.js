var path = require('path');
var ts = require('typescript');

function getSlamImports(source, dir) {
    var imports = ts.preProcessFile(source, true, true).importedFiles || [];
    return imports
        .map(function (imp) { return imp.fileName; })
        .filter(function (imp) { return /\.slam$/.test(imp); })
        .map(function (imp) { return path.resolve(dir, imp); });
}

function loader(source, sourceMap) {
    var callback = this.async() || this.callback;
    var data = this.data;
    getSlamImports(source, path.dirname(this.resourcePath)).forEach(function (imp) {
        data['ts-loader-files'][imp + '.d.ts'] = 'export const bam: string;';
    });
    callback(null, source, sourceMap);
}

loader.pitch = function(remainingRequest, precedingRequest, data) {
    data['ts-loader-files'] = {};
}

module.exports = loader;
