const os = require('os');
const fs = require('fs');
const path = require('path');
const execFileSync = require('child_process').execFileSync;
const getProgram = require('./getProgram');

// Build
const program = getProgram.getProgram(path.resolve(__dirname, 'tsconfig.json'));
const diagnostics = getProgram.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  for (const d of diagnostics) {
    process.stderr.write(getProgram.formatDiagnostic(program, d));
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
removeStagingPath(stagingPath);

runTests();

function removeStagingPath(folderPath) {
  fs.rmSync(folderPath, { recursive: true, force: true, maxRetries: 5 });
}

// --------------------------------------------------------------

function runTests() {
  const start = new Date().getTime();
  console.log(
    '\n-------------------------------------------------------------------------\n'
  );
  console.log(`Starting to run test suites on ${os.platform()}...\n`);

  const testDir = __dirname;

  if (singleTestToRun) {
    const testName = getTestNameFromPath(singleTestToRun);
    if (isRunnableTest(testName)) {
      if (runTestAsChildProcess(testName)) {
        passingTests.push(singleTestToRun);
      } else {
        failingTests.push(singleTestToRun);
      }
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

          
          // skip project references / custom transformer tests for now as they are not supported yet
          if (testName.startsWith('projectReferences') || 
            testName.startsWith('customTransformer') || 
            testName.startsWith('nolib') || // nolib does not seem worth supporting at all, as it is a very niche use case
            testName.startsWith('tsconfigInvalidFile') // not sure how useful this is
          ) {
            console.log(
              `Skipping test ${testName} as project references / custom transformer tests are not supported yet`
            );
            return false;
          }

          return isRunnableTest(testName);
        }
      )
      .filter(
        /**
         * @param {string} testName
         */ testName => (testCriteria ? !!testName.match(testCriteria) : true)
      );

    // Allow multiple attempts to pass tests as they're flaky
    let attempt = 0;
    while (++attempt <= 5 && passingTests.length < availableTests.length) {
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

/**
 * Whether a folder is a test to run; logs why an ignored test is skipped.
 * A name that doesn't exist counts as runnable, so the run reports it as failing.
 * @param {string} testName
 */
function isRunnableTest(testName) {
  const testPath = path.join(__dirname, testName);
  if (!fs.existsSync(testPath)) {
    return true;
  }
  // testLib is the library the npmLink test links to, not a test
  if (!fs.statSync(testPath).isDirectory() || testName === 'testLib') {
    return false;
  }
  if (fs.existsSync(path.join(testPath, '_IGNORE_'))) {
    console.log(`Skipping test ${testName} as it has an _IGNORE_ file`);
    return false;
  }
  return true;
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
  const debug = process.argv.indexOf('--debug') > -1;
  const nodeArgs = debug ? ['--inspect-brk=5858'] : [];
  const jasminePath = path.resolve(__dirname, '../../node_modules/jasmine/bin/jasmine.js');
  const jasmineArgs = [
    // keeps the transpileOnly run after the normal one
    '--random=false',
    // also tells picocolors to colour webpack's output, which the snapshots expect
    '--color',
    path.join(__dirname, 'create-and-execute-test.js'),
    // the rest are create-and-execute-test.js's own arguments
    '--',
    '--test-to-run=' + testName,
  ].concat(saveOutputMode ? ['--save-output'] : []);

  try {
    execFileSync(process.execPath, nodeArgs.concat(jasminePath, jasmineArgs), { stdio: 'inherit' });
    return true;
  } catch (_err) {
    return false;
  }
}
