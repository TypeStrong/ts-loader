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
        extensions: ['', '.ts', 'tsx', '.js']
    },
    module: {
        loaders: [
            { test: /\.tsx?$/, loader: 'ts-loader' }
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': require('path').join(__dirname, "../../index.js") } }
```

You can run all the tests in the Comparison Test Pack with `npm run comparison-tests`. You can also go into an individual test directory and manually build a project using `webpack` or `webpack --watch`. This can be useful both when developing the test and also when fixing an issue or adding a feature.

Each test should have an `expectedOutput` directory which contains any webpack filesystem output (typically `bundle.js` and possibly `bundle.js.map`) and any console output. stdout should go in `output.txt` and stderr should go in `err.txt`.

To run all the tests use:

`npm run comparison-tests`.

If you would like to run just a single test then:

`npm run comparison-tests -- --single-test nameOfTest`

## Regenerating test data

As a convenience it is possible to regenerate the expected output from the actual output. This is useful when creating new tests and also when making a change that affects multiple existing tests. To run use:

`npm run comparison-tests -- --save-output`. 

Note that all tests will automatically pass when using this feature. You should double check the generated files to make sure
the output is indeed correct.

If you would like to regenerate a single test then combine `--save-output` with 
`--single-test` like so:

`npm run comparison-tests -- --save-output --single-test nameOfTest`

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
