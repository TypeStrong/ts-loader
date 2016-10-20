var fs = require('fs-extra');
var path = require('path');
var rimraf = require('rimraf');
var typescript = require('typescript');
var semver = require('semver');
var execSync = require('child_process').execSync;

// Don't run the tests if using a version of typescript other than 2.0; 
// i.e. not typescript@next and not typescript pre 2.0
// We only want to run comparison tests for the latest released version
var typescriptVersion = semver.major(typescript.version) + '.' + semver.minor(typescript.version);
if (typescriptVersion !== '2.0') return;

// Parse command line arguments
var saveOutputMode = process.argv.indexOf('--save-output') !== -1;
var indexOfSingleTest = process.argv.indexOf('--single-test');
var singleTestToRun = indexOfSingleTest !== -1 && process.argv[indexOfSingleTest + 1];

var passingTests = [];
var failingTests = [];

// set up new empty staging area
var stagingPath = path.resolve(__dirname, '../../.test');
rimraf.sync(stagingPath);

var start = new Date().getTime();
console.log('Starting to run test suites...\n');

var testDir = __dirname;

if (singleTestToRun) {
    runTests(singleTestToRun);
}
else {
    // loop through each test directory triggering a test run as child process
    fs.readdirSync(testDir)
        .filter(function (testName) {
            var testPath = path.join(testDir, testName);
            return fs.statSync(testPath).isDirectory();
        })
        .forEach(runTests);
}

var end = new Date().getTime();
console.log('\n-------------------------------------------------------------------------\n');
console.log((passingTests.length + failingTests.length) + ' test suites took ' + ((end - start) / 1000) + ' seconds to run.\n');
if (passingTests.length > 0) {
    console.log(passingTests.length + ' test suite(s) passed.\n\n - ' + passingTests.join('\n - ') + '\n');
}

if (failingTests.length > 0) {
    console.log(failingTests.length + ' test suite(s) failed.\n\n - ' + failingTests.join('\n - ') + '\n');
    process.exit(1);
}
else {
    console.log('No tests failed; congratulations!');
}

// --------------------------------------------------------------

function runTests(testName) {
    if (testName === 'testLib') { return; }
    if (testName === 'issue81' && semver.lt(typescript.version, '1.7.0-0')) { return; }

    runTestAsChildProcess(testName, '');

    if (testName === 'declarationOutput') { return; }
    if (testName === 'declarationWatch') { return; }
    if (testName === 'issue71') { return; }

    runTestAsChildProcess(testName, ' --transpile');
}

function runTestAsChildProcess(testName, transpile) {
    try {
        var saveOutput = saveOutputMode ? ' --save-output' : '';

        var command = 'mocha --reporter spec test/comparison-tests/create-and-execute-test.js --test-to-run ' + testName + saveOutput + transpile;
        var testOutput = execSync(command, { stdio: 'inherit' });

        passingTests.push(testName);
    }
    catch (err) {
        failingTests.push(testName);
    }
}
