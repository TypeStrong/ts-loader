const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const rimraf = require('rimraf');
const typescript = require('typescript');
const execSync = require('child_process').execSync;
const getProgram = require('./getProgram');

// Build
const program = getProgram(path.resolve(__dirname, 'tsconfig.json'));
const diagnostics = typescript.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  const formatDiagnosticHost = {
    getCurrentDirectory: typescript.sys.getCurrentDirectory,
    getCanonicalFileName: typescript.sys.useCaseSensitiveFileNames
      ? s => s
      : s => s.toLowerCase(),
    getNewLine: () => typescript.sys.newLine
  };
  for (const d of diagnostics) {
    typescript.sys.write(typescript.formatDiagnostic(d, formatDiagnosticHost));
  }
  throw new Error('Errors in the tests');
}

// Parse command line arguments
const saveOutputMode = process.argv.indexOf('--save-output') !== -1;

const indexOfSingleTest = process.argv.indexOf('--single-test');
const singleTestToRun =
  indexOfSingleTest !== -1 && process.argv[indexOfSingleTest + 1];

const indexOfStartAtTestName = process.argv.indexOf('--start-at');
const startAtTestName =
  indexOfStartAtTestName !== -1 && process.argv[indexOfStartAtTestName + 1];

const indexOfTestCriteria = process.argv.indexOf('--match-test');
const testCriteria =
  indexOfTestCriteria !== -1 &&
  new RegExp(process.argv[indexOfTestCriteria + 1]);

/** @type {string[]} */
let passingTests = [];
/** @type {string[]} */
let failingTests = [];

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
  console.log(`Starting to run test suites on ${os.platform()}...\n`);

  const testDir = __dirname;

  if (singleTestToRun) {
    if (runTestAsChildProcess(getTestNameFromPath(singleTestToRun))) {
      passingTests.push(singleTestToRun);
    } else {
      failingTests.push(singleTestToRun);
    }
  } else {
    // loop through each test directory triggering a test run as child process

    /** @type {string[]} */
    const availableTests = fs
      .readdirSync(testDir)
      .filter(
        /**
         * @param {string} testName
         */ testName => {
          if (startAtTestName && testName < startAtTestName) {
            return false;
          }

          const testPath = path.join(testDir, testName);
          const isATest = fs.statSync(testPath).isDirectory();
          return isATest;
        }
      )
      .filter(
        /**
         * @param {string} testName
         */ testName => (testCriteria ? !!testName.match(testCriteria) : true)
      );

    // Allow multiple attempts to pass tests as they're flaky
    let attempt = 0;
    while (++attempt <= 40 && passingTests.length < availableTests.length) {
      if (attempt > 1) {
        console.log(`Some tests failed; re-running (attempt ${attempt})`);
      }

      availableTests
        .filter(testName => !passingTests.includes(testName))
        .forEach(testName => {
          if (runTestAsChildProcess(testName)) {
            passingTests.push(testName);
          }
        });
    }

    failingTests = availableTests.filter(
      testName => !passingTests.includes(testName)
    );
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

/** @param {string} testNameOrPath */
function getTestNameFromPath(testNameOrPath) {
  var tsLoaderPath = path.resolve(__dirname, '../..');
  var tsLoaderBasename = path.basename(tsLoaderPath);
  var comparisonTestsRelativeRoot = path.relative(tsLoaderPath, __dirname);
  var comparisonTestsAbsoluteRoot = path.join(
    tsLoaderPath,
    comparisonTestsRelativeRoot
  );
  // It wasn’t a path in comparison-tests; assume it was a test name
  if (
    testNameOrPath.indexOf(
      path.join(tsLoaderBasename, comparisonTestsRelativeRoot)
    ) === -1
  ) {
    return testNameOrPath;
  }
  // E.g. projectReferences/lib/index.ts
  var testPathRelativeToComparisonTests = path.relative(
    comparisonTestsAbsoluteRoot,
    testNameOrPath
  );
  return testPathRelativeToComparisonTests.split(path.sep)[0];
}

/**
 * Run test isolated in a child process
 *
 * @param {string} testName
 */
function runTestAsChildProcess(testName) {
  const testToRun = ' --test-to-run ' + testName;
  const debug = process.argv.indexOf('--debug') > -1;
  const testCommand =
    'mocha -c --reporter spec ' +
    (debug ? '--inspect-brk=5858 ' : '') +
    'test/comparison-tests/create-and-execute-test.js ' +
    testToRun;

  try {
    const _testOutput = execSync(
      testCommand + (saveOutputMode ? ' --save-output' : ''),
      { stdio: 'inherit' }
    );
    /* No longer necessary and experimentalFileCaching is enabled by default - approach may prove useful in future though
    if (!saveOutputMode) {
      const _testOutput2 = execSync(
        testCommand + ' --extra-option experimentalFileCaching',
        { stdio: 'inherit' }
      );
    }
    */
    return true;
  } catch (err) {
    return false;
  }
}
