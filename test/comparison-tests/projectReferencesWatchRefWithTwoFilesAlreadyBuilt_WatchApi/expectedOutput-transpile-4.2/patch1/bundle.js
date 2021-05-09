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

eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nvar lib_1 = __webpack_require__(/*! ./lib */ \"./lib/index.ts\");\nconsole.log(lib_1.lib.one, lib_1.lib.two, lib_1.lib.three);\n\n\n//# sourceURL=webpack:///./app.ts?");

/***/ }),

/***/ "./lib/helper.ts":
/*!***********************!*\
  !*** ./lib/helper.ts ***!
  \***********************/
/***/ ((__unused_webpack_module, exports) => {

eval("\nexports.__esModule = true;\nexports.helper = void 0;\nexports.helper = {\n    one: 1,\n    two: 2,\n    three: 3,\n    four: 4\n};\n\n\n//# sourceURL=webpack:///./lib/helper.ts?");

/***/ }),

/***/ "./lib/index.ts":
/*!**********************!*\
  !*** ./lib/index.ts ***!
  \**********************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("\nexports.__esModule = true;\nexports.lib = void 0;\nvar helper_1 = __webpack_require__(/*! ./helper */ \"./lib/helper.ts\");\nexports.lib = {\n    one: helper_1.helper.one,\n    two: helper_1.helper.two,\n    three: helper_1.helper.three,\n    four: 4\n};\n\n\n//# sourceURL=webpack:///./lib/index.ts?");

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