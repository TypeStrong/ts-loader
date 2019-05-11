# Comparison Test Pack

This test pack comprises a number of mini-typescript projects which, as part of the test run, are each run through webpack.  
The outputs (both compiled JavaScript and webpack compilation output) are compared against a set of expected 
outputs. These are particularly useful for testing failure cases; that is testing scenarios where you expect compilation
to fail and ensuring the failure is what you expect. For example, ensuring the presence of error messages from the TypeScript 
compiler in the output etc.

The comparison test pack can be found under `/test/comparison-tests`. The test harness uses certain conventions. All tests have their own directory under `/test/comparison-tests`, eg `/test/comparison-tests/someFeature`. Each test should have a `webpack.config.js` file which follows this general convention:

```javascript
module.exports = {
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', 'tsx', '.js']
    },
    module: {
        rules: [
            { test: /\.tsx?$/, loader: 'ts-loader' }
        ]
    }
}

```

You can run all the tests in the Comparison Test Pack with `yarn run comparison-tests`. You can also go into an individual test directory and manually build a project using `webpack` or `webpack --watch`. This can be useful both when developing the test and also when fixing an issue or adding a feature.

Each test should have an `expectedOutput` directory which contains any webpack filesystem output (typically `bundle.js` and possibly `bundle.js.map`) and any console output. stdout should go in `output.txt` and stderr should go in `err.txt`.

To run all the tests use:

`yarn run comparison-tests`.

If you would like to run just a single test then:

`yarn run comparison-tests -- --single-test nameOfTest`

## Regenerating test data

As a convenience it is possible to regenerate the expected output from the actual output. This is useful when creating new tests and also when making a change that affects multiple existing tests. To run use:

`yarn run comparison-tests -- --save-output`. 

Note that all tests will automatically pass when using this feature. You should double check the generated files to make sure
the output is indeed correct.

If you would like to regenerate a single test then combine `--save-output` with 
`--single-test` like so:

`yarn run comparison-tests -- --save-output --single-test nameOfTest`

**When doing this, do make sure you get the casing of the name of the test right.  If you get it wrong you'll spend a long time wondering why tests are failing...**

## Watch Specific Tests

The test harness additionally supports tests which exercise watch mode, since that is such an integral part of webpack. Watch mode tests are just the as standard comparison tests.  However, after the initial compilation and comparison, a series of "patches" are applied and tested. 

The patches live in folders following the naming convention of `/patchN` starting with 0. After the initial compilation and comparison, the patches are iterated through and the files in place are replaced with any modified files in the `/patchN` directory.  After each patch application the compilation / comparison is performed once more.

For example:

Initial state:
- test/someFeature/app.ts
- test/someFeature/expectedOutput/bundle.js
- test/someFeature/expectedOutput/output.txt

patch0 is applied:
- test/someFeature/patch0/app.ts - *modified file*
- test/someFeature/expectedOutput/patch0/bundle.js - *bundle after applying patch*
- test/someFeature/expectedOutput/patch0/output.txt - *output after applying patch*

## Flaky tests

Some of the tests in the pack are flaky.  For the most part the failures they occasionally experience are not significant.  If you want a test to be allowed to fail without failing the overall build whilst still seeing the output then place a file with the name `_FLAKY_` in the root of that particular test.

## Debugging

See [CONTRIBUTING.md](../../CONTRIBUTING.md#debugging).