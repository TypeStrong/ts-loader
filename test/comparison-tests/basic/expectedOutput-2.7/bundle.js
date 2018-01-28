/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./app.ts");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./app.ts":
/*!****************!*\
  !*** ./app.ts ***!
  \****************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nexports.__esModule = true;\nvar submodule = __webpack_require__(/*! ./submodule/submodule */ \"./submodule/submodule.ts\");\nvar externalLib = __webpack_require__(/*! externalLib */ \"./lib/externalLib.js\");\nexternalLib.doSomething(submodule);\n\n\n//////////////////\n// WEBPACK FOOTER\n// ./app.ts\n// module id = ./app.ts\n// module chunks = main\n\n//# sourceURL=webpack:///./app.ts?");

/***/ }),

/***/ "./lib/externalLib.js":
/*!****************************!*\
  !*** ./lib/externalLib.js ***!
  \****************************/
/*! no static exports found */
/***/ (function(module, exports) {

eval("module.exports = {\n    doSomething: function() { }   \n}\n\n//////////////////\n// WEBPACK FOOTER\n// ./lib/externalLib.js\n// module id = ./lib/externalLib.js\n// module chunks = main\n\n//# sourceURL=webpack:///./lib/externalLib.js?");

/***/ }),

/***/ "./submodule/submodule.ts":
/*!********************************!*\
  !*** ./submodule/submodule.ts ***!
  \********************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nvar externalLib = __webpack_require__(/*! externalLib */ \"./lib/externalLib.js\");\nexternalLib.doSomething(\"\");\nvar message = \"Hello from submodule\";\nmodule.exports = message;\n\n\n//////////////////\n// WEBPACK FOOTER\n// ./submodule/submodule.ts\n// module id = ./submodule/submodule.ts\n// module chunks = main\n\n//# sourceURL=webpack:///./submodule/submodule.ts?");

/***/ })

/******/ });