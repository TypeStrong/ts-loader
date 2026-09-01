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
 */

import fs from 'node:fs';
import { buildWebpackConfig, runColdBuild, createWatchSession, withTimeout, touchFile } from './scenarios.mts';

const INITIAL_BUILD_TIMEOUT_MS = 120_000;
const REBUILD_TIMEOUT_MS = 30_000;

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

  const config = buildWebpackConfig({
    fixtureDir,
    tsconfigPath,
    entryFile,
    tsLoaderRoot,
    transpileOnly,
    outputPath,
  });

  const durations: number[] = [];

  if (scenarioType === 'cold') {
    for (let i = 0; i < iterations; i++) {
      const ms = await withTimeout(runColdBuild(config), INITIAL_BUILD_TIMEOUT_MS, `cold build iteration ${i}`);
      durations.push(ms);
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
      for (let i = 0; i < iterations; i++) {
        const pending = withTimeout(session.nextCompile(), REBUILD_TIMEOUT_MS, `${label} iteration ${i}`);
        touchFile(touchFilePath, touchOriginal, i);
        durations.push(await pending);
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
