'use strict';

const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;
const execFileSync = require('child_process').execFileSync;
const webpack = require('webpack');
const pathExists = require('../pathExists');

process.env.NODE_ENV = 'test';

// Parse command line arguments
const indexOfSingleTest = process.argv.indexOf('--single-test');
const singleTestToRun = indexOfSingleTest !== -1 && process.argv[indexOfSingleTest + 1];
const watch = process.argv.indexOf('--watch') !== -1 && !!singleTestToRun;
const indexOfTestCriteria = process.argv.indexOf('--match-test');
const testCriteria =
  indexOfTestCriteria !== -1 && new RegExp(process.argv[indexOfTestCriteria + 1]);

const passingTests = [];
const failingTests = [];

const start = new Date().getTime();
console.log('Starting to run test suites...\n');

const testDir = __dirname;

/**
 * Tests of loader options that the TypeScript 7 API makes inert, skipped until the
 * native API supports them again
 */
const unsupportedTests = {
    loaderOptions: 'custom transformers (getCustomTransformers)',
    resolveModuleName: 'custom module resolution (resolveModuleName)',
};

if (singleTestToRun) {
    runTests(singleTestToRun);
}
else {
    // loop through each test directory triggering a test run as child process
    fs.readdirSync(testDir)
        .filter(isTestDirectory)
        .filter(isHighEnoughWebpackVersion)
        .filter(isSupportedTest)
        .filter(
            /**
             * @param {string} testName
             */ testName =>
                testCriteria ? !!testName.match(testCriteria) : true
        )
        .forEach(runTests);
}

const end = new Date().getTime();
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
    const testPath = path.join(testDir, testName);
    return fs.statSync(testPath).isDirectory();
}

/**
 * A test can declare the webpack major version it needs in a `test.json`,
 * e.g. `{ "minWebpack": 5 }`; it is skipped on older webpack.
 * @param {string} testName
 */
function isHighEnoughWebpackVersion (testName) {
    const testConfigPath = path.join(testDir, testName, 'test.json');
    if (!pathExists(testConfigPath)) {
        return true;
    }
    const minWebpack = JSON.parse(fs.readFileSync(testConfigPath, 'utf8')).minWebpack;
    const webpackMajor = Number(webpack.version.split('.')[0]);
    if (minWebpack !== undefined && webpackMajor < minWebpack) {
        console.log('Skipping test ' + testName + ' as it needs webpack ' + minWebpack + ' or later; the installed version is ' + webpack.version);
        return false;
    }
    return true;
}

/** @param {string} testName */
function isSupportedTest (testName) {
    const unsupported = unsupportedTests[testName];
    if (unsupported) {
        console.log('Skipping test ' + testName + ' as the TypeScript 7 API does not yet support ' + unsupported + '.');
        return false;
    }
    return true;
}


function getTestNameFromPath (testNameOrPath) {
    const tsLoaderPath = path.resolve(__dirname, '../..');
    const tsLoaderBasename = path.basename(tsLoaderPath);
    const executionTestsRelativeRoot = path.relative(tsLoaderPath, __dirname);
    const executionTestsAbsoluteRoot = path.join(tsLoaderPath, executionTestsRelativeRoot);
    // It wasn’t a path in execution-tests; assume it was a test name
    if (testNameOrPath.indexOf(path.join(tsLoaderBasename, executionTestsRelativeRoot)) === -1) {
        return testNameOrPath;
    }
    // E.g. projectReferences/lib/index.ts
    const testPathRelativeToExecutionTests = path.relative(executionTestsAbsoluteRoot, testNameOrPath);
    return testPathRelativeToExecutionTests.split(path.sep)[0];
}

function runTests(testName) {
    testName = getTestNameFromPath(testName);
    console.log('\n-------------------------------------------------------------------------\n');
    console.log('RUNNING THIS TEST SUITE: ' + testName +'\n\n');

    const testPath = path.join(testDir, testName);

    if (!pathExists(testPath)) {
        console.log('TEST DOES NOT EXIST AT THIS LOCATION: ' + testPath);
        failingTests.push(testName);
        return;
    }

    const hasSpecs = pathExists(path.join(testPath, 'main.js'));
    const debug = process.argv.indexOf('--debug') > -1;

    if (pathExists(path.join(testPath, 'pnpm-lock.yaml'))) {
        console.log('npm install -g pnpm into ' + testPath);
        execSync('npm install -g pnpm', { cwd: testPath, stdio: 'inherit' });
        execSync('pnpm install', { cwd: testPath, stdio: 'inherit' });
    } else if (pathExists(path.join(testPath, 'package.json'))) {
        console.log('npm install into ' + testPath);
        // install-links: some packs git-track copies of their file: deps in node_modules,
        // which npm's default of symlinking file: deps would delete.
        // legacy-peer-deps: yarn never enforced the packs' (often stale) peer ranges.
        execSync('npm install --install-links --legacy-peer-deps --no-audit --no-fund', { cwd: testPath, stdio: 'inherit' });
    }

    try {
        const nodeArgs = debug ? ['--inspect-brk=5858'] : [];
        if (hasSpecs) {
            const watchArgs = watch ? ['--watch'] : [];
            execFileSync(process.execPath, nodeArgs.concat(path.join(__dirname, 'run-specs.js'), watchArgs), { cwd: testPath, stdio: 'inherit' });
        } else {
            console.log('running webpack compilation');
            execFileSync(process.execPath, nodeArgs.concat(path.join(__dirname, 'run-webpack.js')), { cwd: testPath, stdio: 'inherit' });
        }
        passingTests.push(testName);
    }
    catch (_err) {
        failingTests.push(testName);
    }
}
