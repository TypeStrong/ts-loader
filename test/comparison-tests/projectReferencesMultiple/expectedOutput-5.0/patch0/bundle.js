/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https:/webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https:/webpack.js.org/configuration/mode/).
 */
/******/ (() => { / webpackBootstrap
/******/ 	var __webpack_modules__ = ({
/***/ "./app.ts":
/*!**********!*/
  !*** ./app.ts ***!
  /**********/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {
"use strict";
eval("
Object.defineProperty(exports, /"__esModule/", ({ value: true }));
var lib_1 = __webpack_require__(/*! ./lib */ /"./lib/index.ts/");
var utils_1 = __webpack_require__(/*! ./utils */ /"./utils/index.ts/");
console.log(lib_1.lib.one, lib_1.lib.two, lib_1.lib.three);
(0, utils_1.utils)();
/# sourceURL=webpack://./app.ts?");
/***/ }),
/***/ "./lib/index.ts":
/*!**********!*/
  !*** ./lib/index.ts ***!
  /**********/
/***/ ((__unused_webpack_module, exports) => {
"use strict";
eval("
Object.defineProperty(exports, /"__esModule/", ({ value: true }));
exports.lib = void 0;
exports.lib = {
    one: 1,
    two: 2,
    three: 3
};
/# sourceURL=webpack://./lib/index.ts?");
/***/ }),
/***/ "./utils/index.ts":
/*!**********!*/
  !*** ./utils/index.ts ***!
  /**********/
/***/ (() => {
eval("throw new Error(/"Module build failed (from ../../index.js):/nError: TypeScript emitted no output for /projectReferencesMultiple/utils/index.ts. The most common cause for this is having errors when building referenced projects./n    at makeSourceMapAndFinish (ts-loader)/n    at successLoader (ts-loader)/n    at Object.loader (ts-loader)/");
/# sourceURL=webpack://./utils/index.ts?");
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
/******/ 	var __webpack_exports__ = __webpack_require__("./app.ts");
/******/ 	
/******/ })()
;