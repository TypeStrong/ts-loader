'use strict';

var webpack = require('webpack');
var typescript = require('typescript');
var execSync = require('child_process').execSync;


console.log('Using webpack version ' + webpackVersion);
console.log('Using typescript version ' + typescript.version);

execSync('npm run comparison-tests', { stdio: 'inherit' });
execSync('npm run execution-tests', { stdio: 'inherit' });
