'use strict';

var webpackVersion = require('webpack/package.json').version;
var typescript = require('typescript');
var execSync = require('child_process').execSync;

console.log('Using webpack version ' + webpackVersion);
console.log('Using typescript version ' + typescript.version);

execSync('yarn run comparison-tests', { stdio: 'inherit' });
execSync('yarn run execution-tests', { stdio: 'inherit' });
