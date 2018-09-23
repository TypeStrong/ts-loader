"use strict";
exports.__esModule = true;
var foo_1 = require("./foo");
exports.lib = {
    one: 1,
    two: 2,
    three: 3,
    foo: foo_1.foo
    // I am adding this comment here by hand to ensure
    // Webpack is using the JS output for project references
};
