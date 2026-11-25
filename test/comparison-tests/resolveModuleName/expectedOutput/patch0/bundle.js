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
eval("{\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.wrong = exports.def = void 0;\nconst baz_1 = __webpack_require__(/*! baz */ \"./baz-pkg/index.js\");\nconst greeting_1 = __webpack_require__(/*! ./greeting */ \"./greeting.ts\");\nexports.def = (0, baz_1.makeHello)(1, 2);\n// Deliberate type error: only reported this way if 'baz' and 'foo' resolved\n// through the custom resolver - otherwise it's a TS2307 \"Cannot find module\".\nexports.wrong = exports.def.hello;\nconsole.log(greeting_1.greeting, exports.def, exports.wrong);\n\n\n//# sourceURL=webpack:///./app.ts?\n}");

/***/ }),

/***/ "./baz-pkg/index.js":
/*!**************************!*\
  !*** ./baz-pkg/index.js ***!
  \**************************/
/***/ ((__unused_webpack_module, exports) => {

eval("{exports.makeHello = function (hello, world) {\n  return { hello: hello, world: world };\n};\n\n\n//# sourceURL=webpack:///./baz-pkg/index.js?\n}");

/***/ }),

/***/ "./greeting.ts":
/*!*********************!*\
  !*** ./greeting.ts ***!
  \*********************/
/***/ ((__unused_webpack_module, exports) => {

"use strict";
eval("{\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.greeting = void 0;\nexports.greeting = 'hello';\n\n\n//# sourceURL=webpack:///./greeting.ts?\n}");

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
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./app.ts");
/******/ 	
/******/ })()
;