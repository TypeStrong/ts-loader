function populateClientExports(exports) {
    exports.foo = require('./foo').foo;
}
exports.populateClientExports = populateClientExports;