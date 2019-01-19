'use strict';

// var Server = require('karma').Server;
var fs = require('fs-extra');
var path = require('path');
var execSync = require('child_process').execSync;
var typescript = require('typescript');
var semver = require('semver');
var pathExists = require('../pathExists');

process.env.NODE_ENV = 'test';

// Parse command line arguments
var indexOfSingleTest = process.argv.indexOf('--single-test');
var singleTestToRun = indexOfSingleTest !== -1 && process.argv[indexOfSingleTest + 1];
var watch = process.argv.indexOf('--watch') !== -1 && !!singleTestToRun;

var passingTests = [];
var failingTests = [];

var start = new Date().getTime();
console.log('Starting to run test suites...\n');

var testDir = __dirname;

if (singleTestToRun) {
    runTests(singleTestToRun);
}
else {
    // loop through each test directory triggering a test run as child process
    fs.readdirSync(testDir)
        .filter(isTestDirectory)
        .filter(isHighEnoughTypeScriptVersion)
        .filter(isNotHappyPackTest)
        // .filter(isNotBabelTest)
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

/** Temporarily exclude HappyPack dependent tests */
function isNotHappyPackTest (testName) {
    var isHappyPackTest = testName.includes('happypack');
    if (isHappyPackTest) {
        console.log('Skipping test ' + testName + ' as it requires happypack.  Dropping these tests until happypack support for webpack for is in place.');
        return false;
    }
    return true;
}

/** Temporarily exclude Babel dependent tests */
function isNotBabelTest (testName) {
    var isBabelTest = testName.includes('babel');
    if (isBabelTest) {
        console.log('Skipping test ' + testName + ' as it requires babel.  Dropping these tests until babel-loader support for webpack for is in place.');
        return false;
    }
    return true;
}

function runTests(testName) {
    console.log('\n-------------------------------------------------------------------------\n');
    console.log('RUNNING THIS TEST SUITE: ' + testName +'\n\n');

    var testPath = path.join(testDir, testName);

    if (!pathExists(testPath)) {
        console.log('TEST DOES NOT EXIST AT THIS LOCATION: ' + testPath);
        failingTests.push(testName);
        return;
    }

    var karmaConfPath = path.join(testPath, 'karma.conf.js');

    if (pathExists(path.join(testPath, 'shrinkwrap.yaml'))) {
        console.log('npx pnpm install into ' + testPath);
        execSync('npx pnpm install --force', { cwd: testPath, stdio: 'inherit' });
    } else if (pathExists(path.join(testPath, 'package.json'))) {
        console.log('yarn install into ' + testPath);
        execSync('yarn install', { cwd: testPath, stdio: 'inherit' });
    }

    try {
        if (pathExists(path.join(testPath, 'karma.conf.js'))) {
            var singleRunOrWatch = watch ? '' : ' --single-run';
            execSync('karma start --reporters mocha' + singleRunOrWatch + ' --browsers ChromeHeadlessNoSandbox', { cwd: testPath, stdio: 'inherit' });

            passingTests.push(testName);
        } else {
            console.log('running webpack compilation');
            execSync('webpack --bail', { cwd: testPath, stdio: 'inherit' });
            passingTests.push(testName);
        }
    }
    catch (err) {
        failingTests.push(testName);
    }
}
