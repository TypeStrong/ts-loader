'use strict';

var execSync = require('child_process').execSync;

execSync('npm run execution-tests', { stdio: 'inherit' });
execSync('npm run comparison-tests', { stdio: 'inherit' });
