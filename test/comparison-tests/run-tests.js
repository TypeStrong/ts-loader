const fs = require('fs-extra');
const path = require('path');
const rimraf = require('rimraf');
const typescript = require('typescript');
const semver = require('semver');
const execSync = require('child_process').execSync;

// We only want to run comparison tests for the latest released version
const typescriptVersion = parseFloat(
  semver.major(typescript.version) + '.' + semver.minor(typescript.version)
);
// @ts-ignore
if (typescriptVersion < 3.0 || typescriptVersion > 3.0) return;

// Parse command line arguments
const saveOutputMode = process.argv.indexOf('--save-output') !== -1;
const indexOfSingleTest = process.argv.indexOf('--single-test');
const singleTestToRun =
  indexOfSingleTest !== -1 && process.argv[indexOfSingleTest + 1];

const passingTests = [];
const failingTests = [];

// set up new empty staging area
const stagingPath = path.resolve(__dirname, '../../.test');
rimraf.sync(stagingPath);

runTests();

// --------------------------------------------------------------

function runTests() {
  const start = new Date().getTime();
  console.log(
    '\n-------------------------------------------------------------------------\n'
  );
  console.log('Starting to run test suites...\n');

  const testDir = __dirname;

  if (singleTestToRun) {
    runTestAsChildProcess(singleTestToRun);
  } else {
    // loop through each test directory triggering a test run as child process
    fs.readdirSync(testDir)
      .filter(
        /**
         * @param {string} testName
         */ testName => {
          const testPath = path.join(testDir, testName);
          return fs.statSync(testPath).isDirectory();
        }
      )
      .forEach(runTestAsChildProcess);
  }

  const end = new Date().getTime();
  console.log(
    '\n-------------------------------------------------------------------------\n'
  );
  const totalTests = passingTests.length + failingTests.length;
  console.log(
    `${totalTests} test suites took ${(end - start) / 1000} seconds to run.\n`
  );
  if (passingTests.length > 0) {
    console.log(
      `${passingTests.length} test suite(s) passed.\n\n - ${passingTests.join(
        '\n - '
      )}\n`
    );
  }

  if (failingTests.length > 0) {
    console.log(
      `${failingTests.length} test suite(s) failed.\n\n - ${failingTests.join(
        '\n - '
      )}\n`
    );
    process.exit(1);
  } else {
    console.log('No tests failed; congratulations!');
  }
}

/**
 * Run test isolated in a child process
 *
 * @param {string} testName
 */
function runTestAsChildProcess(testName) {
  const testToRun = ' --test-to-run ' + testName;
  const testCommand =
    'mocha --reporter spec test/comparison-tests/create-and-execute-test.js ' +
    testToRun;

  // execution tests are flaky so allow 3 attempts
  let attempt = 1;
  let passed = false;
  while (!passed) {
    try {
      const _testOutput = execSync(
        testCommand + (saveOutputMode ? ' --save-output' : ''),
        { stdio: 'inherit' }
      );
      if (!saveOutputMode) {
        const _testOutput2 = execSync(
          testCommand + ' --extra-option experimentalFileCaching',
          { stdio: 'inherit' }
        );
      }
      passed = true
    } catch (err) {
      console.info(`Attempt ${attempt} failed...`);
      if (attempt >= 5) throw new Error("Failed to run test repeatedly.")
      attempt++;
    }
  }

  if (passed) {
    passingTests.push(testName);
  } else {
    failingTests.push(testName);
  }
}
