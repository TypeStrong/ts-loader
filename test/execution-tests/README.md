# Execution Test Pack

This test pack is made up of a number of mini-typescript projects which include a test suite.  As part of the test run, each project is compiled and the test suite run using Karma. So this test pack is different from the comparison test pack in that it **executes the compiled code**. This test pack is useful for testing expected behaviour.  (It's also reassuring to see your
code being executed.)

These tests are executed more widely that the comparison tests; we aim to run these against each version of TypeScript defined in our CI build matrices.

## Structure

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

## What sort of tests can be included?

It's pretty much your choice what goes in testwise.  At present there are only Jasmine tests in place; it should be possible to put any test in place that Karma is compatible with. You can specify dependencies (include @types dependencies) using `package.json`.  As a first step before tests are executed, `yarn install` is called to install dependencies.

## Running / debugging the tests

To run all the tests use:

`yarn run execution-tests`.

If you would like to run just a single test then:

`yarn run execution-tests -- --single-test nameOfTest`

It's pretty handy to be able to debug tests; for that reason you can run a single test in watch mode like this:

`yarn run execution-tests -- --single-test nameOfTest --watch`

Then you can fire up http://localhost:9876/ and the world's your oyster.

See [CONTRIBUTING.md](../../CONTRIBUTING.md#debugging) for more information on debugging.
