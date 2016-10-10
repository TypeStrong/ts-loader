'use strict';

// var Server = require('karma').Server;
var fs = require('fs-extra');
var path = require('path');
var execSync = require('child_process').execSync;
var typescript = require('typescript');
var semver = require('semver');

// Parse command line arguments
var indexOfSingleTest = process.argv.indexOf('--single-test');
var singleTestToRun = indexOfSingleTest !== -1 && process.argv[indexOfSingleTest + 1];

var passingTests = [];
var failingTests = [];

var start = new Date().getTime();
console.log('Starting to run test suites...\n');
var versionsHaveBeenReported = false;

var testDir = __dirname;

if (singleTestToRun) {
    runTests(singleTestToRun);
}
else {
    // loop through each test directory triggering a test run as child process
    fs.readdirSync(testDir)
        .filter(isTestDirectory)
        .filter(isHighEnoughTypeScriptVersion)
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

function isTestDirectory (testName) {
    var testPath = path.join(testDir, testName);
    return fs.statSync(testPath).isDirectory();
}

function isHighEnoughTypeScriptVersion (testName) {
    var minTsVersionAndTestName = testName.split('_');
    if (minTsVersionAndTestName.length === 2) {
        var minTsVersion = minTsVersionAndTestName[0];
        if (semver.lt(typescript.version, minTsVersion)) {
            console.log('Skipping test ' + testName + ' as its minimum version of ' + minTsVersion + ' is greater than our current version of TypeScript: ' + typescript.version);
            return false;
        }
    }
    return true;
}

function runTests(testName) {
    console.log('RUNNING: ' + testName);

    var testPath = path.join(testDir, testName);
    var karmaConfPath = path.join(testPath, 'karma.conf.js');

    console.log('Installing typings into ' + testPath);
    execSync('typings install', { cwd: testPath, stdio: 'inherit' });

    try {
        // console.log('Kicking off karma at ' + karmaConfPath);
        execSync('karma start --reporters mocha --single-run --browsers PhantomJS', { cwd: testPath, stdio: 'inherit' });

        passingTests.push(testName);
    }
    catch (err) {
        failingTests.push(testName);
    }
    // var karmaConfig = {
    //     configFile: karmaConfPath,
    //     singleRun: true,

    //     plugins: ['karma-webpack', 'karma-jasmine', 'karma-mocha-reporter', 'karma-sourcemap-loader', 'karma-phantomjs-launcher'],
    //     reporters: ['mocha']
    // };

    // new Server(karmaConfig, function (exitCode) {
    //     karmaCompleted(exitCode, testName);
    // }).start();
}

// function karmaCompleted(exitCode, testName) {
//     if (exitCode !== 0) {
//         failingTests.push(testName);
//         console.log('Karma: tests failed with code ' + exitCode);
//         process.exit(exitCode);
//     } else {
//         passingTests.push(testName);
//         console.log('Karma completed!');
//     }
// }
