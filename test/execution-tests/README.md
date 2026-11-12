# Execution Test Pack

This test pack is made up of a number of mini-typescript projects which include a test suite. As part of the test run, each project is compiled with webpack and ts-loader, and its Jasmine specs are run in Node. So this test pack is different from the comparison test pack in that it **executes the compiled code**. This test pack is useful for testing expected behaviour. (It's also reassuring to see your code being executed.)

These tests are executed more widely that the comparison tests; we aim to run these against each version of TypeScript and webpack defined in our CI build matrices.

## Structure

The execution test pack can be found under `/test/execution-tests`. Like the comparison test pack, the execution test pack uses certain conventions. All tests have their own directory under `/test/execution-tests`, eg `/test/execution-tests/someFeature`, named after the feature being tested. Each test has a `webpack.config.js` file; build-only tests may use `webpack.config.mjs` for an ESM config. Tests with specs usually also have a `main.js` file that loads them:

```js
const testsContext = require.context('./', true, /\.tests\.ts(x?)$/);
testsContext.keys().forEach(testsContext);
```

For each test, [`run-specs.js`](run-specs.js) builds `main.js` for Node (`target: 'node'`, with an inline source map) into a temporary folder, using the `module`, `resolve` and `resolveLoader` settings from the test's `webpack.config.js`. It then runs the bundle with Jasmine. A test fails if the build has any errors, if a spec fails, or if no specs ran.

A test without a `main.js` is just built with its own `webpack.config.js`, and passes if the build has no errors.

A test can have a `test.json` file in its directory, with rules for when it runs:

```json
{
  "minWebpack": 5
}
```

- `"minWebpack"`: the test is skipped when the installed webpack major version is lower than this.
- `"skip"`: the test is always skipped, and this reason is printed. For example, tests of loader options that the TypeScript 7 API makes inert have `"skip": "the TypeScript 7 API does not yet support ..."`.

An invalid `test.json` fails that test.

**IMPORTANT**

In order that the local version of ts-loader is resolved for tests a `webpack.config.js` file will need to include this line:

```js
// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': path.join(__dirname, "../../../index.js") } }
// note that there are 3 ../ here as compared with only 2 for the comparison tests
```

Without this, the test won't be able to resolve ts-loader.

## What sort of tests can be included?

Specs are written with [Jasmine](https://jasmine.github.io/) (`describe`, `it`, `expect`) and run in Node, so they can't rely on browser APIs such as `document`.

Dependencies that most tests share are installed once, in the root `package.json`: `jasmine` and `@types/jasmine`, and Babel 7 (`@babel/core`, `@babel/preset-env`, `@babel/preset-react`) with `babel-loader` 8, which supports both webpack 4 and 5. A test only needs its own `package.json` for anything else; when it has one, `npm install` is run in its directory before the test.

## Running / debugging the tests

To run all the tests use:

`npm run execution-tests`.

If you would like to run just a single test then:

`npm run execution-tests -- --single-test nameOfTest`

To rebuild and re-run a single test whenever you change a file, use watch mode:

`npm run execution-tests -- --single-test nameOfTest --watch`

Adding `--debug` starts the test paused, waiting for a debugger on port 5858. The build and the specs run in the same Node process, so you can set breakpoints in both ts-loader's `src` and the test's specs. In VS Code, open a file in the test and use the "Run open execution test" launch configuration. (With `--watch`, the specs run in a fresh process after each build, so breakpoints in the specs aren't hit; ones in `src` still are.)

`--single-test` applies the same `test.json` rules as a full run.

See [CONTRIBUTING.md](../../CONTRIBUTING.md#debugging) for more information on debugging.
