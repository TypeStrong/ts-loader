// @ts-check
const fs = require('fs-extra');
const path = require('path');
const mkdirp = require('mkdirp');
const copySync = require('./copySync');

// BASH script to delete old test output
// find ./test/comparison-tests -type d -name '*expectedOutput*4.1' -print0 | xargs -0 -I {} /bin/rm -rf "{}"

// update this manually when a new version comes out
const OLD_VERSION = '4.0';
const NEW_VERSION = '4.1';

fs.readdirSync(__dirname).forEach(function(test) {
  const testPath = path.join(__dirname, test);
  if (fs.statSync(testPath).isDirectory()) {
    if (test === 'testLib') return;

    const expectedOutput = path.join(testPath, `expectedOutput-${OLD_VERSION}`);
    const newExpectedOutput = path.join(
      testPath,
      `expectedOutput-${NEW_VERSION}`
    );

    mkdirp.sync(newExpectedOutput);
    copySync(expectedOutput, newExpectedOutput);

    const expectedTranspileOutput = path.join(
      testPath,
      `expectedOutput-transpile-${OLD_VERSION}`
    );
    const newExpectedTranspileOutput = path.join(
      testPath,
      `expectedOutput-transpile-${NEW_VERSION}`
    );

    if (fs.existsSync(expectedTranspileOutput)) {
      mkdirp.sync(newExpectedTranspileOutput);
      copySync(expectedTranspileOutput, newExpectedTranspileOutput);
    }
  }
});
