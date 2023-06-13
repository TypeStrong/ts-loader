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
/***/ "./src/error1.js":
/*!**********!*/
  !*** ./src/error1.js ***!
  /**********/
/***/ ((__unused_webpack_module, exports) => {
eval("
Object.defineProperty(exports, /"__esModule/", ({ value: true }));
exports.Class1 = void 0;
var Class1 = /** @class */ (function () {
    function Class1() {
    }
    Class1.prototype.foo = function () {
        this.bar;
    };
    return Class1;
}());
exports.Class1 = Class1;
/# sourceURL=webpack://./src/error1.js?");
/***/ }),
/***/ "./src/error2.js":
/*!**********!*/
  !*** ./src/error2.js ***!
  /**********/
/***/ ((__unused_webpack_module, exports) => {
eval("
Object.defineProperty(exports, /"__esModule/", ({ value: true }));
exports.Class2 = void 0;
/ @ts-check
var Class2 = /** @class */ (function () {
    function Class2() {
    }
    Class2.prototype.foo = function () {
        this.bar;
    };
    return Class2;
}());
exports.Class2 = Class2;
/# sourceURL=webpack://./src/error2.js?");
/***/ }),
/***/ "./src/index.js":
/*!**********!*/
  !*** ./src/index.js ***!
  /**********/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {
eval("
Object.defineProperty(exports, /"__esModule/", ({ value: true }));
var error1_1 = __webpack_require__(/*! ./error1 */ /"./src/error1.js/");
var error2_1 = __webpack_require__(/*! ./error2 */ /"./src/error2.js/");
new error1_1.Class1().foo();
new error2_1.Class2().foo();
/# sourceURL=webpack://./src/index.js?");
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
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		/ Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/**********/
/******/ 	
/******/ 	/ startup
/******/ 	/ Load entry module and return exports
/******/ 	/ This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./src/index.js");
/******/ 	
/******/ })()
;