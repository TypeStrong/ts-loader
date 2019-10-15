'use strict';

var webpackVersion = require('webpack/package.json').version;
var typescript = require('typescript');
var execSync = require('child_process').execSync;

const testArgs = process.argv.length > 2 ? ` -- ${process.argv.slice(2).join(" ")}` : "";

console.log('Using webpack version --' + webpackVersion);
console.log('Using typescript version ' + typescript.version);

execSync(`yarn run comparison-tests${testArgs}`, { stdio: 'inherit' });
execSync(`yarn run execution-tests${testArgs}`, { stdio: 'inherit' });
