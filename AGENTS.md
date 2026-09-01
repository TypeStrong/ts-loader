# AGENTS.md

ts-loader is a TypeScript loader for webpack, enabling webpack to compile `.ts` and `.tsx` files via the TypeScript compiler.

## Package manager

Use `yarn` (not npm).

## Key commands

Note: test scripts clean test directories first using `git clean -xfd`.

```bash
yarn build              # compile src/ → dist/ (tsc --project "./src")
yarn lint               # type-check + ESLint (no separate typecheck script)
yarn test               # full test suite (comparison + execution tests)
yarn comparison-tests   # fast subset: compare webpack output against snapshots
yarn execution-tests    # run compiled code via Karma/Jasmine
yarn benchmark          # compare this build's compile speed against another ts-loader checkout
```

To run a single test:
```bash
yarn comparison-tests -- --single-test <testName>
yarn execution-tests  -- --single-test <testName> --watch
```

## Comparison tests (`test/comparison-tests/`)

Each sub-directory is a mini webpack project. The harness compiles it and diffs the output against `expectedOutput/` snapshots (`bundle.js`, `output.txt`, `err.txt`). These are especially useful for failure cases — asserting that the right compiler errors appear.

Full docs: [`test/comparison-tests/README.md`](test/comparison-tests/README.md)

**Watch-mode tests** apply a series of patches (`patch0/`, `patch1/`, …) after the initial build, re-compiling and re-comparing after each one.

**Flaky tests**: place an empty `_FLAKY_` file in the test directory to allow occasional failures without blocking the build.

```bash
yarn comparison-tests                                              # all tests
yarn comparison-tests -- --single-test <name>                     # one test
yarn comparison-tests -- --save-output                            # regenerate all snapshots
yarn comparison-tests -- --save-output --single-test <name>       # regenerate one snapshot
```

> Note: test name casing must be exact when using `--single-test`.

## Execution tests (`test/execution-tests/`)

Each sub-directory is a mini webpack project with a Karma/Jasmine test suite. The harness compiles the project and **runs the compiled code** — useful for asserting correct runtime behaviour. These are matrix-tested in CI across multiple Node and TypeScript versions (see `.github/workflows/push.yml` for the current matrix).

Full docs: [`test/execution-tests/README.md`](test/execution-tests/README.md)

Tests prefixed with a TypeScript version (e.g. `2.0.3_es2016`) are skipped when the installed TypeScript is older than that prefix.

Every `webpack.config.js` in this pack must include this alias so the local ts-loader is resolved:
```js
// for test harness purposes only
module.exports.resolveLoader = { alias: { 'ts-loader': path.join(__dirname, "../../../index.js") } }
```

```bash
yarn execution-tests                                    # all tests
yarn execution-tests -- --single-test <name>            # one test
yarn execution-tests -- --single-test <name> --watch    # watch mode (open http://localhost:9876/)
```

## Benchmark tests (`test/benchmark-tests/`)

Answers "did this get faster or slower?", not "is the output correct?" - the comparison/execution packs never record timing, so this is a separate harness. It generates a synthetic project on the fly and times ts-loader compiling it (cold build, and incremental rebuild after touching a low-fan-out vs. high-fan-out file, under both `transpileOnly: true`/`false`), comparing two ts-loader checkouts (this build vs. another, e.g. `main`) back-to-back in one process so the relative numbers are meaningful despite noisy CI hosts.

Full docs: [`test/benchmark-tests/README.md`](test/benchmark-tests/README.md)

**Report-only**: `.github/workflows/benchmark.yml` posts results as a PR comment/job summary on every PR; it does not fail the build.

```bash
yarn benchmark -- --root-a . --root-b .                # sanity check against itself, expect ~0% deltas
yarn benchmark -- --root-a . --root-b ../ts-loader-main # compare against another built checkout
```

Always add or update tests when fixing bugs or adding features — see [CONTRIBUTING.md](CONTRIBUTING.md).
