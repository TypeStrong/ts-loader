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

/***/ "./component.vue":
/*!***********************!*\
  !*** ./component.vue ***!
  \***********************/
/***/ ((__unused_webpack_module, exports) => {

eval("{\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports[\"default\"] = {\n    data() {\n        return {\n            msg: \"component\"\n        };\n    }\n};\n\n\n//# sourceURL=webpack:///./component.vue?\n}");

/***/ }),

/***/ "./helper.ts":
/*!*******************!*\
  !*** ./helper.ts ***!
  \*******************/
/***/ ((__unused_webpack_module, exports) => {

eval("{\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.myMethod = myMethod;\nfunction myMethod() {\n    console.log('from helper!');\n}\n\n\n//# sourceURL=webpack:///./helper.ts?\n}");

/***/ }),

/***/ "./index.vue":
/*!*******************!*\
  !*** ./index.vue ***!
  \*******************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

eval("{\nvar __importDefault = (this && this.__importDefault) || function (mod) {\n    return (mod && mod.__esModule) ? mod : { \"default\": mod };\n};\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nconst component_vue_1 = __importDefault(__webpack_require__(/*! ./component.vue */ \"./component.vue\"));\nconst helper_1 = __webpack_require__(/*! ./helper */ \"./helper.ts\");\nexports[\"default\"] = {\n    components: { component: component_vue_1.default },\n    data() {\n        return {\n            msg: \"world\"\n        };\n    },\n    method: {\n        myMethod: helper_1.myMethod\n    }\n};\n\n\n//# sourceURL=webpack:///./index.vue?\n}");

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
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
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
/******/ 	var __webpack_exports__ = __webpack_require__("./index.vue");
/******/ 	
/******/ })()
;