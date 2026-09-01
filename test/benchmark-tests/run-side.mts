/**
 * Subprocess entry-point for one side of a benchmark scenario.
 *
 * Invoked by run-benchmark.mts via spawn. Runs all (warmup + measured)
 * iterations for a single side and writes `{ durations: number[] }` JSON to
 * stdout. Running each side in its own fresh OS process ensures the two
 * TypeScript + webpack instances never share a heap, so GC pressure from one
 * side cannot inflate the other's timings.
 *
 * CLI args (all required):
 *   --fixture-dir   <path>   fixture src directory
 *   --tsconfig      <path>   fixture tsconfig.json path
 *   --entry         <path>   fixture entry file path
 *   --ts-loader-root <path>  checkout root for the ts-loader under test
 *   --output-path   <path>   webpack output directory
 *   --transpile-only <bool>  'true' | 'false'
 *   --scenario-type <string> 'cold' | 'leaf' | 'hub'
 *   --touch-file    <path>   file to touch (incremental scenarios only)
 *   --touch-original <path>  file containing original content (incremental scenarios only)
 *   --iterations    <n>      total number of iterations (warmup + measured)
 *   --warmup        <n>      warmup iterations already included in --iterations
 */

import fs from 'node:fs';
import { buildWebpackConfig, runColdBuild, createWatchSession, withTimeout, touchFile } from './scenarios.mts';

const INITIAL_BUILD_TIMEOUT_MS = 120_000;
const REBUILD_TIMEOUT_MS = 30_000;
// Per-scenario wall-clock cap, applied only after --warmup + MIN_MEASURED_ITERATIONS
// samples are in hand. --iterations Ă— multiplier (see run-benchmark.mts) assumes a
// cheap-to-instantiate compiler; a sync-API compiler that spawns a native child
// process per instance (e.g. tsgo) or does per-dependant round trips for a
// wide-fanout touch (e.g. a hub file imported by most of the fixture) can be
// 10-100x more expensive per iteration, which would otherwise blow the CI job's
// timeout long before every scenario finishes. Capping wall-clock instead of
// guessing a smaller fixed iteration count keeps full statistical power for
// scenarios that stay cheap while still bounding the expensive ones.
const SCENARIO_TIME_BUDGET_MS = 60_000;
const MIN_MEASURED_ITERATIONS = 2;

function get(flag: string): string {
  const argv = process.argv;
  const i = argv.indexOf(flag);
  if (i === -1 || i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
    throw new Error(`Missing required argument: ${flag}`);
  }
  return argv[i + 1];
}

async function main(): Promise<void> {
  const fixtureDir = get('--fixture-dir');
  const tsconfigPath = get('--tsconfig');
  const entryFile = get('--entry');
  const tsLoaderRoot = get('--ts-loader-root');
  const outputPath = get('--output-path');
  const transpileOnly = get('--transpile-only') === 'true';
  const scenarioType = get('--scenario-type') as 'cold' | 'leaf' | 'hub';
  const iterations = Number(get('--iterations'));
  const warmup = Number(get('--warmup'));

  const config = buildWebpackConfig({
    fixtureDir,
    tsconfigPath,
    entryFile,
    tsLoaderRoot,
    transpileOnly,
    outputPath,
  });

  const durations: number[] = [];
  const minIterationsBeforeBudgetCutoff = warmup + MIN_MEASURED_ITERATIONS;

  /**
   * True once enough samples exist to slice off `warmup` and still leave
   * MIN_MEASURED_ITERATIONS measured ones, AND the scenario has run past its
   * wall-clock budget - i.e. safe to stop early. `loopStart` excludes the
   * (untimed) initial/watch-session build above.
   */
  function pastBudget(count: number, loopStart: number): boolean {
    return (
      count >= minIterationsBeforeBudgetCutoff &&
      Date.now() - loopStart >= SCENARIO_TIME_BUDGET_MS
    );
  }

  if (scenarioType === 'cold') {
    const loopStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      const ms = await withTimeout(runColdBuild(config), INITIAL_BUILD_TIMEOUT_MS, `cold build iteration ${i}`);
      durations.push(ms);
      if (pastBudget(durations.length, loopStart)) {
        console.error(
          `run-side: cold ${transpileOnly ? 'transpileOnly' : 'typeCheck'} stopped early after ${durations.length}/${iterations} iterations (${SCENARIO_TIME_BUDGET_MS}ms budget)`,
        );
        break;
      }
    }
  } else {
    const touchFilePath = get('--touch-file');
    const touchOriginalPath = get('--touch-original');

    const touchOriginal = fs.readFileSync(touchOriginalPath, 'utf8');

    const touchKey = scenarioType; // 'leaf' | 'hub'
    const label = `${touchKey} rebuild`;

    const session = await withTimeout(
      createWatchSession(config),
      INITIAL_BUILD_TIMEOUT_MS,
      `initial build for ${label}`
    );
    try {
      const loopStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        const pending = withTimeout(session.nextCompile(), REBUILD_TIMEOUT_MS, `${label} iteration ${i}`);
        touchFile(touchFilePath, touchOriginal, i);
        durations.push(await pending);
        if (pastBudget(durations.length, loopStart)) {
          console.error(
            `run-side: ${label} (${transpileOnly ? 'transpileOnly' : 'typeCheck'}) stopped early after ${durations.length}/${iterations} iterations (${SCENARIO_TIME_BUDGET_MS}ms budget)`,
          );
          break;
        }
      }
    } finally {
      await session.close();
    }
  }

  process.stdout.write(JSON.stringify({ durations }) + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
