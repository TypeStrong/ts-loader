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
eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nvar submodule = __webpack_require__(/*! ./submodule/submodule */ \"./submodule/submodule.ts\");\nvar externalLib = __webpack_require__(/*! externalLib */ \"./lib/externalLib.js\");\nexternalLib.doSomething(submodule);\n\n\n//# sourceURL=webpack:///./app.ts?");

/***/ }),

/***/ "./submodule/submodule.ts":
/*!********************************!*\
  !*** ./submodule/submodule.ts ***!
  \********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
eval("\nvar externalLib = __webpack_require__(/*! externalLib */ \"./lib/externalLib.js\");\nexternalLib.doSomething(\"\");\nvar message = \"Hello from submodule\";\nmodule.exports = message;\n\n\n//# sourceURL=webpack:///./submodule/submodule.ts?");

/***/ }),

/***/ "./lib/externalLib.js":
/*!****************************!*\
  !*** ./lib/externalLib.js ***!
  \****************************/
/***/ ((module) => {

eval("module.exports = {\n    doSomething: function() { }   \n}\n\n//# sourceURL=webpack:///./lib/externalLib.js?");

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