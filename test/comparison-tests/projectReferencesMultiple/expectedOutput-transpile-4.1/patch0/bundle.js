/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./app.ts":
/*!****************!*\
  !*** ./app.ts ***!
  \****************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";
eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nvar lib_1 = __webpack_require__(/*! ./lib */ \"./lib/index.ts\");\nvar utils_1 = __webpack_require__(/*! ./utils */ \"./utils/index.ts\");\nconsole.log(lib_1.lib.one, lib_1.lib.two, lib_1.lib.three);\nutils_1.utils();\n\n\n//# sourceURL=webpack:///./app.ts?");

/***/ }),

/***/ "./lib/index.ts":
/*!**********************!*\
  !*** ./lib/index.ts ***!
  \**********************/
/***/ ((__unused_webpack_module, exports) => {

"use strict";
eval("\nexports.__esModule = true;\nexports.lib = void 0;\nexports.lib = {\n    one: 1,\n    two: 2,\n    three: 3\n};\n\n\n//# sourceURL=webpack:///./lib/index.ts?");

/***/ }),

/***/ "./utils/index.ts":
/*!************************!*\
  !*** ./utils/index.ts ***!
  \************************/
/***/ (() => {

eval("throw new Error(\"Module build failed (from ../../index.js):/nError: TypeScript emitted no output for /projectReferencesMultiple.transpile/utils/index.ts. The most common cause for this is having errors when building referenced projects./n    at makeSourceMapAndFinish (/workspaces/ts-loader/dist/index.js:53:18)/n    at successLoader (/workspaces/ts-loader/dist/index.js:40:5)/n    at Object.loader (/workspaces/ts-loader/dist/index.js:23:5)\");\n\n//# sourceURL=webpack:///./utils/index.ts?");

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