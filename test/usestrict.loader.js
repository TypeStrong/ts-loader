var ReplaceSource = require("webpack-core/lib/ReplaceSource");
var SourceMapSource = require("webpack-core/lib/SourceMapSource");
var RawSource = require("webpack-core/lib/RawSource");

module.exports = function(contents, sourceMap) {
    this.cacheable();
    var regex = /[^\S\r\n]*"use strict";\n?/g;
    
    if (!sourceMap) return contents.replace(regex, '');
    
    var callback = this.async();
    var source = new ReplaceSource(new SourceMapSource(contents, null, sourceMap))
    
    // remove "use strict" statements (not needed once TS 1.7 and below are no longer supported)
    //contents = contents.replace(/[^\S\r\n]*"use strict";\n/g, '')
    var regexResult;
    
    while ((regexResult = regex.exec(contents)) !== null) {
        source.replace(regexResult.index, regexResult.index+regexResult[0].length-1, '');
    }
    
    callback(null, source.source(), source.map()); 
}