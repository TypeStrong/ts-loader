"use strict";
exports.__esModule = true;
var ts = require("typescript");
var transformer = function (context) {
    var visitor = function (node) {
        if (node.kind === ts.SyntaxKind.StringLiteral) {
            var text = node.text;
            if (text !== text.toUpperCase()) {
                    // createLiteral removed in 5.1 https://github.com/microsoft/TypeScript/issues/53077#issuecomment-1453846217
                    return ts.createLiteral ? ts.createLiteral(text.toUpperCase()) : ts.factory.createStringLiteral(text.toUpperCase());
            }
        }
        return ts.visitEachChild(node, visitor, context);
    };
    return function (node) { return ts.visitNode(node, visitor); };
};
exports["default"] = transformer;
