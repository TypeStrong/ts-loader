# Benchmark Test Pack

This pack answers a different question from the comparison and execution test packs: not "is the output correct?" but "did this change make ts-loader faster or slower?" It generates a synthetic webpack project on the fly and times ts-loader compiling it, comparing two ts-loader builds (typically: this branch vs. `main`) back-to-back in the same process.

**This is report-only.** Nothing here fails a build - see `.github/workflows/benchmark.yml`, which posts the comparison as a PR comment and job summary rather than gating merges. That may change once we've watched real-world noise levels for a while.

## Why not reuse the comparison/execution test packs?

Their fixtures are tiny (a handful of files, 1-2 watch patches) and built for output-correctness diffing - the harness never records timing. Useful signal for "did output change", useless for "did it get slower".

## How it works

1. `generate-fixture.mts` writes a synthetic TypeScript project: a `hub` module imported by most other files, many independent `leaf` modules (imported by only a couple of files each), `mid` modules that combine a few leaves, and an entry point that imports every `mid`. Two identical copies are generated (`.benchmark/fixture-a`, `.benchmark/fixture-b`) so two concurrent watch sessions never see each other's file changes.
2. `scenarios.mts` provides the primitives: a cold (non-watch) build, and a watch session with a `nextCompile()` you can await after touching a file.
3. `run-benchmark.mts` is the CLI entry point, run directly by Node's native TypeScript support (Node 24+, no build step). The `.mts` extension marks these as ES modules regardless of the package's own CommonJS `type`, matching how `import`/`export` is authored elsewhere in this repo. For both `transpileOnly: true` and `transpileOnly: false`, it runs:
   - **Cold build** - a fresh `webpack()` compile.
   - **Incremental rebuild, leaf touch** - touch a file with ~1-2 dependants.
   - **Incremental rebuild, hub touch** - touch the file most things depend on, to specifically exercise dependant-recheck codepaths (see `src/after-compile.ts`'s `populateReverseDependencyGraph`/`collectAllDependants`, used by `determineFilesToCheckForErrors` to decide which files need rechecking after a change).

   Each scenario runs 2 discarded warmup iterations plus 6 measured ones, alternating which side (`a`/`b`) goes first each iteration to cancel host drift/thermal bias, and reports the **median** (robust to the odd stalled iteration).

## Running it

```bash
yarn build                                             # build this checkout's dist/
yarn benchmark -- --root-a . --root-b .                # sanity check: compares a build against itself, expect ~0% deltas

# compare against another ts-loader checkout, e.g. a git worktree of main
git worktree add ../ts-loader-main main
(cd ../ts-loader-main && yarn install && yarn build)
yarn benchmark -- --root-a . --root-b ../ts-loader-main
```

`--root-a`/`--root-b` each point at a ts-loader checkout root (must contain a built `index.js`/`dist/`) - matching the `resolveLoader.alias` pattern used in `test/execution-tests/*/webpack.config.js`.

Other flags: `--files <n>` (default 300, the fixture's module count), `--warmup <n>` (default 2), `--iterations <n>` (default 6), `--benchmark-dir <path>` (default `.benchmark`, gitignored), `--label-a`/`--label-b <name>` (default `A`/`B` - override for more readable table headers, e.g. `--label-a "PR branch" --label-b "base branch"` as `.github/workflows/benchmark.yml` does).

Results are written to `.benchmark/benchmark-results.json` (raw samples) and `.benchmark/benchmark-results.md` (summary table), and also printed to stdout.

## Interpreting deltas

The percentage is **A relative to B** (`(a.median - b.median) / b.median`), so a positive number means side A is slower. A row gets a ⚠️ only when its delta both passes ±10% *and* clears 2x the combined sample stddev (as a % of B's median) - a flat percentage threshold alone flags noisy scenarios (e.g. cold builds on a busy CI host) on jitter rather than a real difference. It's a nudge to look closer, not a failure signal.

Under `transpileOnly: true`, hub-touch and leaf-touch should cost about the same, since `makeAfterCompile` in `src/after-compile.ts` returns immediately for transpileOnly instances, before `determineFilesToCheckForErrors`/dependant-recheck ever runs. If those two ever diverge under transpileOnly, something has leaked into that path that shouldn't be there.
