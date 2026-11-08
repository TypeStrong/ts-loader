# Execution Test Pack

This test pack is made up of a number of mini-typescript projects which include a test suite.  As part of the test run, each project is compiled and the test suite run using Karma. So this test pack is different from the comparison test pack in that it **executes the compiled code**. This test pack is useful for testing expected behaviour.  (It's also reassuring to see your
code being executed.)

These tests are executed more widely that the comparison tests; we aim to run these against each version of TypeScript defined in our CI build matrices.

## Structure

The execution test pack can be found under `/test/execution-tests`. Like the comparison test pack, the execution test pack uses certain conventions. All tests have their own directory under `/test/execution-tests`, eg `/test/execution-tests/someFeature`, named after the feature being tested. Each test has a `webpack.config.js` file and usually a `karma.conf.js` file. A test without a `karma.conf.js` is just built with webpack, and passes if the build has no errors.

If a test requires a minimum version of webpack, add a `test.json` file to its directory:

```json
{
  "minWebpack": 5
}
```

The test is skipped when the installed webpack major version is lower than that.

**IMPORTANT**

In order that the local version of ts-loader is resolved for tests a `webpack.config.js` file will need to include this line:

```js
// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': path.join(__dirname, "../../../index.js") } }
// note that there are 3 ../ here as compared with only 2 for the comparison tests
```

And the `karma.conf.js` should build its config with the shared helper in [`test/karmaConfig.js`](../karmaConfig.js), which passes the webpack config's `module`, `resolve` and `resolveLoader` on to Karma:

```js
var webpackConfig = require('./webpack.config.js');
var makeKarmaConfig = require('../../karmaConfig');

module.exports = function(config) {
  config.set(
    makeKarmaConfig({
      config,
      webpackConfig,
      files: [
        // This loads all the tests
        'main.js'
      ]
    })
  );
};
```

Without this, the test won't be able to resolve ts-loader and webpack won't find your TypeScript tests.

## What sort of tests can be included?

It's pretty much your choice what goes in testwise. At present there are only Jasmine tests in place; it should be possible to put any test in place that Karma is compatible with.

Dependencies that most tests share are installed once, in the root `package.json`: `@types/jasmine` (Jasmine itself comes with `karma-jasmine`), and Babel 7 (`@babel/core`, `@babel/preset-env`, `@babel/preset-react`) with `babel-loader` 8, which supports both webpack 4 and 5. A test only needs its own `package.json` for anything else; when it has one, `npm install` is run in its directory before the test.

## Running / debugging the tests

To run all the tests use:

`npm run execution-tests`.

If you would like to run just a single test then:

`npm run execution-tests -- --single-test nameOfTest`

It's pretty handy to be able to debug tests; for that reason you can run a single test in watch mode like this:

`npm run execution-tests -- --single-test nameOfTest --watch`

Then you can fire up http://localhost:9876/ and the world's your oyster.

See [CONTRIBUTING.md](../../CONTRIBUTING.md#debugging) for more information on debugging.
