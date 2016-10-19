# Contributer's Guide

We welcome contributions from the community and have gathered guidelines 
here to help you get started.

## Discussion

While not absolutely required, it is encouraged that you first open an issue 
for any bug or feature request. This allows discussion on the proper course of
action to take before coding begins.

## Building

```shell
npm install
npm run build
```

## Changing

Most of the information you need to contribute code changes can [be found here](https://guides.github.com/activities/contributing-to-open-source/).
In short: fork, branch, make your changes, and submit a pull request.

## Testing

This project makes use of 2 integration test packs to make sure we don't break anything. That's right, count them, 2! There is a comparison test pack which compares compilation outputs and is long established.  There is also an execution test pack which executes the compiled JavaScript. This test pack is young and contains fewer tests; but it shows promise.

You can run all the tests (in both test packs) with `npm test`.

To run comparison tests alone use `npm run comparison-tests`.
To run execution tests alone use `npm run execution-tests`.

Not all bugs/features necessarily fit into either framework and that's OK. However, most do and therefore you should make every effort to create at least one test which demonstrates the issue or exercises the feature. Use your judgement to decide whether you think a comparison test or an execution test is most appropriate.

### Comparison Test Pack

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

#### Regenerating test data

As a convenience it is possible to regenerate the expected output from the actual output. This is useful when creating new tests and also when making a change that affects multiple existing tests. To run use:

`npm run comparison-tests -- --save-output`. 

Note that all tests will automatically pass when using this feature. You should double check the generated files to make sure
the output is indeed correct.

If you would like to regenerate a single test then combine `--save-output` with 
`--single-test` like so:

`npm run comparison-tests -- --save-output --single-test nameOfTest`

#### Watch Specific Tests

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

### Execution Test Pack

This test pack is made up of a number of mini-typescript projects which include a test suite.  As part of the test run, each project is compiled and the test suite run using Karma. So this test pack is different from the comparison test pack in that it **executes the compiled code**. This test pack is useful for testing expected behaviour.  (It's also reassuring to see your
code being executed.)

These tests are executed more widely that the comparison tests; we aim to run these against each version of TypeScript defined in our CI build matrices. (Take a look at [`appveyor.yml`](appveyor.yml) and [`.travis.yml`](.travis.yml) for details.)

#### Structure

The execution test pack can be found under `/test/execution-tests`. Like the comparison test pack, the execution test pack uses certain conventions. All tests have their own directory under `/test/execution-tests`, eg `/test/execution-tests/someFeature`. Each test is expected to have a `karma.conf.js` file and a `webpack.config.js` file.

If a test requires a minimum version of TypeScript then the test directory should be prefixed with the minimum TypeScript version.  For example, the `2.0.3_es2016` test requires a minimum TypeScript version of 2.0.3; if the installed version is lower than the test needs then the test will be skipped.

**IMPORTANT**

In order that the local version of ts-loader is resolved for tests a `webpack.config.js` file will need to include this line:

```
// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': path.join(__dirname, "../../../index.js") } }
// note that there are 3 ../ here as compared with only 2 for the comparison tests
```

And likewise the `karma.conf.js` will need to reuse this like so:

```
    webpack: {
      devtool: 'inline-source-map',
      debug: true,
      module: {
          loaders: webpackConfig.module.loaders
      },
      resolve: webpackConfig.resolve,

      // for test harness purposes only, you would not need this in a normal project
      resolveLoader: webpackConfig.resolveLoader
    },
```

Without this, the test won't be able to resolve ts-loader and webpack won't find your TypeScript tests.

#### What sort of tests can be included?

It's pretty much your choice what goes in testwise.  At present there are only Jasmine tests in place; it should be possible to put any test in place that Karma is compatible with. The test pack also expects a `typings.json` file and calls `typings install` in each. **Be warned, type definitions are not installed until the test framework has been run.**  So if you're wanting to refactor a test you'll need to `typings install` if the requisite typings have not yet been installed. It's possible / probably that this may changed in the future; 
particularly to cater for situations where types should be acquired via npm etc.

#### Running / debugging the tests

To run all the tests use:

`npm run execution-tests`.

If you would like to run just a single test then:

`npm run execution-tests -- --single-test nameOfTest`

It's pretty handy to be able to debug tests; for that reason you can run a single test in watch mode like this:

`npm run execution-tests -- --single-test nameOfTest --watch`

Then you can fire up http://localhost:9876/ and the world's your oyster.
