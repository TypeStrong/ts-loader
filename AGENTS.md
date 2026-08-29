# AGENTS.md

ts-loader is a TypeScript loader for webpack, enabling webpack to compile `.ts` and `.tsx` files via the TypeScript compiler.

## Package manager

Use `yarn` (not npm).

## Style

Prefer function declarations for named functions, especially reusable helpers. Use `function name(...) {}` instead of `const name = (...) => {}` when the function needs a name, as this is generally preferred for readability and consistency.

## Key commands

Note: test scripts clean test directories first using `git clean -xfd`.

```bash
yarn build              # compile src/ → dist/ (tsc --project "./src")
yarn lint               # type-check + oxlint (no separate typecheck script)
yarn test               # full test suite (comparison + execution tests)
yarn comparison-tests   # fast subset: compare webpack output against snapshots
yarn execution-tests    # run compiled code via Karma/Jasmine
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
yarn comparison-tests                                             # all tests
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

## Testing on Windows CI

macOS/Linux passing locally does **not** mean Windows passes — this codebase has repeatedly had Windows-only comparison-test failures with no macOS/Linux equivalent. The recurring root cause: `src/typeScriptApi.ts` calls into the TypeScript API (`typescript/unstable/sync`), whose `program.getSourceFileNames()`/`getConfigFileNames()`/internal lookups return forward-slash-normalized paths on every OS (the long-standing TS compiler convention), while Node's own `path.resolve`/`path.join`/`path.normalize` return OS-native (backslash on Windows) paths. Any place that builds a path with Node's `path` module and then compares it against, or hands it to, something expecting the API's own spelling — a `Set`/`Map` keyed by API-returned names, or webpack's `addDependency`/`addBuildDependency` (which rejects non-native absolute paths) — silently breaks on Windows only. When investigating a new Windows-only failure, check for this pattern first (search for `path.resolve`/`path.join`/`path.normalize` near any `program.get*`/`toComparablePath` usage in `src/typeScriptApi.ts`).

### Windows test probe workflow

`.github/workflows/windows-test-probe.yml` (registered on `main`, so dispatchable against any branch/ref) runs just the Windows comparison tests via `workflow_dispatch` — much faster than the full `push.yml` matrix (which also runs the Ubuntu suite and the full Node/TS/webpack execution-test matrix). Use it to iterate on Windows-only failures without asking a human to relay CI output.

Requires `gh` CLI authenticated with the `workflow` scope (`gh auth login`, then `gh auth refresh -s workflow` if `gh auth status` doesn't already list `workflow` — both scopes need a human to complete the browser device-flow prompt, they can't be scripted).

```bash
# trigger — omit both inputs to run the full comparison-test suite
gh workflow run windows-test-probe.yml --repo TypeStrong/ts-loader \
  --ref <branch> -f single_test=<name>            # one test
gh workflow run windows-test-probe.yml --repo TypeStrong/ts-loader \
  --ref <branch> -f match_test='^(testA|testB)$'  # several, by regex

# the trigger command prints the run URL directly - grab the numeric id from it, then:
gh run watch <run-id> --repo TypeStrong/ts-loader --exit-status   # blocks until done

# `gh run watch` can itself fail on a transient network blip even when the run
# succeeded - always verify conclusion this way rather than trusting its exit code
gh run view <run-id> --repo TypeStrong/ts-loader --json status,conclusion

gh run view <run-id> --repo TypeStrong/ts-loader --log-failed    # full failure log text
```

Always add or update tests when fixing bugs or adding features — see [CONTRIBUTING.md](CONTRIBUTING.md).
