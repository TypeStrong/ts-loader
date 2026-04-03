/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./app.ts":
/*!****************!*\
  !*** ./app.ts ***!
  \****************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("{\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nconst index_1 = __webpack_require__(/*! ./lib/src/index */ \"./lib/src/index.ts\");\nconsole.log(index_1.lib.one, index_1.lib.two, index_1.lib.three);\n\n\n//# sourceURL=webpack:///./app.ts?\n}");

/***/ }),

/***/ "./lib/src/index.ts":
/*!**************************!*\
  !*** ./lib/src/index.ts ***!
  \**************************/
/***/ ((__unused_webpack_module, exports) => {

eval("{\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.lib = void 0;\nexports.lib = {\n    one: 1,\n    two: 2,\n    three: 3\n};\n\n\n//# sourceURL=webpack:///./lib/src/index.ts?\n}");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./app.ts");
/******/ 	
/******/ })()
;