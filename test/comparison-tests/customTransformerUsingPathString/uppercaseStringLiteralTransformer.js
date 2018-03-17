"use strict";
exports.__esModule = true;
var ts = require("typescript");
var transformer = function (context) {
    var visitor = function (node) {
        if (node.kind === ts.SyntaxKind.StringLiteral) {
            var text = node.text;
            if (text !== text.toUpperCase()) {
                return ts.createLiteral(text.toUpperCase());
            }
        }
        return ts.visitEachChild(node, visitor, context);
    };
    return function (node) { return ts.visitNode(node, visitor); };
};
exports["default"] = transformer;
