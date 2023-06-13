/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https:/webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https:/webpack.js.org/configuration/mode/).
 */
/******/ (() => { / webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({
/***/ "./app.ts":
/*!**********!*/
  !*** ./app.ts ***!
  /**********/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {
eval("
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== /"function/" && b !== null)
            throw new TypeError(/"Class extends value /" + String(b) + /" is not a constructor or null/");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var dep = __webpack_require__(/*! ./sub/dep */ /"./sub/dep.ts/");
var Test = /** @class */ (function (_super) {
    __extends(Test, _super);
    function Test() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Test.prototype.doSomething = function () {
    };
    return Test;
}(dep));
module.exports = Test;
/# sourceURL=webpack://./app.ts?");
/***/ }),
/***/ "./sub/dep.ts":
/*!**********!*/
  !*** ./sub/dep.ts ***!
  /**********/
/***/ ((module) => {
eval("
var Test = /** @class */ (function () {
    function Test() {
    }
    Test.prototype.doSomething = function () {
    };
    return Test;
}());
module.exports = Test;
/# sourceURL=webpack://./sub/dep.ts?");
/***/ })
/******/ 	});
/**********/
/******/ 	/ The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	/ The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		/ Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		/ Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			/ no module.id needed
/******/ 			/ no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		/ Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		/ Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/**********/
/******/ 	
/******/ 	/ startup
/******/ 	/ Load entry module and return exports
/******/ 	/ This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./app.ts");
/******/ 	
/******/ })()
;