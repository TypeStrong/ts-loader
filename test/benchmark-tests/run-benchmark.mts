import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateFixture } from './generate-fixture.mts';
import type { FixtureMeta } from './generate-fixture.mts';

const WARMUP_ITERATIONS = 2;
const MEASURED_ITERATIONS = 10;
// CI runners (especially Windows) are noisy enough that even the largest
// scenario (cold typeCheck) occasionally lands outside the expected +-3%
// band on a self-comparison. Every scenario runs both sides concurrently
// (see runScenario below) and gets several times its base iteration count -
// even the slowest scenario has ample time budget within the job timeout -
// to narrow the median's sampling error against that noise.
const ITERATION_MULTIPLIER = 6;
const REGRESSION_FLAG_PCT = 10;
// A delta must also clear this many multiples of the combined sample
// stddev (as a % of the base median) before it's flagged - otherwise a
// noisy scenario can cross REGRESSION_FLAG_PCT on pure host jitter alone.
const REGRESSION_FLAG_NOISE_MULTIPLIER = 2;

interface Args {
  rootA: string;
  rootB: string;
  labelA: string;
  labelB: string;
  fileCount: number;
  warmup: number;
  iterations: number;
  benchmarkDir: string;
}

type Side = 'a' | 'b';

interface ScenarioResult {
  id: string;
  label: string;
  transpileOnly: boolean;
  a: { samples: number[]; median: number; stddev: number };
  b: { samples: number[]; median: number; stddev: number };
  deltaPct: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string, fallback: string): string => {
    const i = argv.indexOf(flag);
    return i === -1 ? fallback : argv[i + 1];
  };
  const rootA = path.resolve(get('--root-a', process.cwd()));
  const rootB = path.resolve(get('--root-b', rootA));
  const warmup = Number(get('--warmup', String(WARMUP_ITERATIONS)));
  const iterations = Number(get('--iterations', String(MEASURED_ITERATIONS)));
  if (!Number.isInteger(warmup) || warmup < 0) throw new Error(`--warmup must be a non-negative integer (got ${warmup})`);
  if (!Number.isInteger(iterations) || iterations <= 0) throw new Error(`--iterations must be a positive integer (got ${iterations})`);
  if (warmup >= iterations) throw new Error(`--warmup (${warmup}) must be less than --iterations (${iterations})`);
  return {
    rootA,
    rootB,
    labelA: get('--label-a', 'A'),
    labelB: get('--label-b', 'B'),
    fileCount: Number(get('--files', '300')),
    warmup,
    iterations,
    benchmarkDir: path.resolve(get('--benchmark-dir', path.join(process.cwd(), '.benchmark'))),
  };
}

function median(values: number[]): number {
  if (values.length === 0) throw new Error('median() called with empty array');
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values: number[]): number {
  if (values.length === 0) throw new Error('stddev() called with empty array');
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

interface SummarizeInput {
  id: string;
  label: string;
  transpileOnly: boolean;
  durations: { a: number[]; b: number[] };
  warmup: number;
}

function summarize({ id, label, transpileOnly, durations, warmup }: SummarizeInput): ScenarioResult {
  const a = durations.a.slice(warmup);
  const b = durations.b.slice(warmup);
  const medianA = median(a);
  const medianB = median(b);
  return {
    id,
    label,
    transpileOnly,
    a: { samples: a, median: medianA, stddev: stddev(a) },
    b: { samples: b, median: medianB, stddev: stddev(b) },
    deltaPct: ((medianA - medianB) / medianB) * 100,
  };
}

const RUN_SIDE_SCRIPT = fileURLToPath(new URL('./run-side.mts', import.meta.url));

interface RunSideOptions {
  root: string;
  meta: FixtureMeta;
  outputPath: string;
  transpileOnly: boolean;
  scenarioType: 'cold' | 'leaf' | 'hub';
  warmup: number;
  iterations: number;
}

function spawnSide(processArgs: string[]): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, processArgs, {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: process.env,
    });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code !== 0) {
        const exitInfo = code !== null ? `exit code ${code}` : `signal ${signal}`;
        reject(new Error(`run-side.mts subprocess failed (${exitInfo})`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as { durations: number[] };
        resolve(parsed.durations);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}

/**
 * Runs all iterations for one side in a fresh subprocess so each side gets
 * its own OS process with exactly one TypeScript + webpack instance on the
 * heap. This eliminates the shared-heap GC pressure that biased in-process
 * interleaved measurements when both TypeScript language service instances
 * co-existed in the same V8 heap.
 */
function runSideProcess({ root, meta, outputPath, transpileOnly, scenarioType, warmup, iterations }: RunSideOptions): Promise<number[]> {
  // Write the touch-original content to a temp file so the subprocess can
  // read it without us serialising potentially-large strings through argv.
  const touchKey = scenarioType as 'leaf' | 'hub';
  let touchOriginalPath = '';
  if (scenarioType !== 'cold') {
    touchOriginalPath = path.join(outputPath, 'touch-original.ts');
    fs.mkdirSync(outputPath, { recursive: true });
    fs.writeFileSync(touchOriginalPath, meta[`${touchKey}TouchOriginal`]);
  }

  const processArgs = [
    RUN_SIDE_SCRIPT,
    '--fixture-dir', meta.fixtureDir,
    '--tsconfig', meta.tsconfigPath,
    '--entry', meta.entryFile,
    '--ts-loader-root', root,
    '--output-path', outputPath,
    '--transpile-only', String(transpileOnly),
    '--scenario-type', scenarioType,
    '--iterations', String(warmup + iterations),
    ...(scenarioType !== 'cold' ? [
      '--touch-file', meta[`${touchKey}TouchFile`],
      '--touch-original', touchOriginalPath,
    ] : []),
  ];

  return spawnSide(processArgs);
}

interface ScenarioOptions {
  id: string;
  label: string;
  transpileOnly: boolean;
  scenarioType: 'cold' | 'leaf' | 'hub';
  fixtureMetaA: FixtureMeta;
  fixtureMetaB: FixtureMeta;
  args: Args;
  outRoot: string;
}

/**
 * Runs both sides of a scenario concurrently, each in its own subprocess.
 * Running them at the same time (rather than one fully finishing before the
 * other starts) means both experience the same wall-clock host conditions -
 * CPU contention, scheduling, disk cache warmth - so that noise is
 * correlated across sides and cancels out of the delta instead of biasing
 * whichever side happens to run during a noisier window.
 */
async function runScenario({
  id,
  label,
  transpileOnly,
  scenarioType,
  fixtureMetaA,
  fixtureMetaB,
  args,
  outRoot,
}: ScenarioOptions): Promise<ScenarioResult> {
  const iterations = args.iterations * ITERATION_MULTIPLIER;
  const sideOptions = (side: Side): RunSideOptions => ({
    root: side === 'a' ? args.rootA : args.rootB,
    meta: side === 'a' ? fixtureMetaA : fixtureMetaB,
    outputPath: path.join(outRoot, side, id),
    transpileOnly,
    scenarioType,
    warmup: args.warmup,
    iterations,
  });

  const [a, b] = await Promise.all([runSideProcess(sideOptions('a')), runSideProcess(sideOptions('b'))]);

  return summarize({ id, label, transpileOnly, durations: { a, b }, warmup: args.warmup });
}

/**
 * A row is flagged only when its delta both exceeds the flat threshold and
 * clears a multiple of its own measurement noise, so a scenario with wide
 * sample variance (e.g. cold builds on a noisy CI host) doesn't trip the
 * flag on jitter alone while a tight, reproducible delta still does.
 */
function isRegressionFlagged(r: ScenarioResult): boolean {
  if (Math.abs(r.deltaPct) < REGRESSION_FLAG_PCT) return false;
  const combinedStddevPct = (Math.sqrt(r.a.stddev ** 2 + r.b.stddev ** 2) / r.b.median) * 100;
  return Math.abs(r.deltaPct) >= REGRESSION_FLAG_NOISE_MULTIPLIER * combinedStddevPct;
}

function toMarkdown(results: ScenarioResult[], args: Args): string {
  const lines = [
    `| Scenario | transpileOnly | ${args.labelA} median (ms) | ${args.labelB} median (ms) | Δ vs ${args.labelB} |`,
    '| --- | --- | --- | --- | --- |',
  ];
  for (const r of results) {
    const flag = isRegressionFlagged(r) ? ' ⚠️' : '';
    lines.push(
      `| ${r.label} | ${r.transpileOnly} | ${r.a.median.toFixed(1)} | ${r.b.median.toFixed(1)} | ${r.deltaPct >= 0 ? '+' : ''}${r.deltaPct.toFixed(1)}%${flag} |`
    );
  }
  lines.push('');
  lines.push(
    `_${args.labelA} = \`${args.rootA}\`, ${args.labelB} = \`${args.rootB}\`. ${args.warmup} warmup + ${args.iterations} measured iterations per scenario, median reported. Report-only - no threshold fails this check._`
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outRoot = path.join(args.benchmarkDir, 'build');
  fs.mkdirSync(args.benchmarkDir, { recursive: true });

  console.log(`Generating fixture (${args.fileCount} files) for both sides...`);
  const fixtureMetaA = generateFixture({
    fixtureDir: path.join(args.benchmarkDir, 'fixture-a'),
    fileCount: args.fileCount,
  });
  const fixtureMetaB = generateFixture({
    fixtureDir: path.join(args.benchmarkDir, 'fixture-b'),
    fileCount: args.fileCount,
  });

  // Sorted back into typeCheck-then-transpileOnly order below for a stable,
  // readable report.
  const results: ScenarioResult[] = [];

  for (const transpileOnly of [false, true]) {
    const mode = transpileOnly ? 'transpileOnly' : 'typeCheck';
    console.log(`Running cold build (${mode})...`);
    results.push(
      await runScenario({
        id: `cold-${mode}`,
        label: 'Cold build',
        transpileOnly,
        scenarioType: 'cold',
        fixtureMetaA,
        fixtureMetaB,
        args,
        outRoot,
      })
    );
  }

  for (const transpileOnly of [false, true]) {
    const mode = transpileOnly ? 'transpileOnly' : 'typeCheck';
    console.log(`Running incremental rebuild, leaf touch (${mode})...`);
    results.push(
      await runScenario({
        id: `incremental-leaf-${mode}`,
        label: 'Incremental rebuild (leaf touch)',
        transpileOnly,
        scenarioType: 'leaf',
        fixtureMetaA,
        fixtureMetaB,
        args,
        outRoot,
      })
    );
  }

  for (const transpileOnly of [false, true]) {
    const mode = transpileOnly ? 'transpileOnly' : 'typeCheck';
    console.log(`Running incremental rebuild, hub touch (${mode})...`);
    results.push(
      await runScenario({
        id: `incremental-hub-${mode}`,
        label: 'Incremental rebuild (hub touch)',
        transpileOnly,
        scenarioType: 'hub',
        fixtureMetaA,
        fixtureMetaB,
        args,
        outRoot,
      })
    );
  }

  // Array.prototype.sort is stable (guaranteed since ES2019), so this
  // regroups by mode for the report without disturbing the cold/leaf/hub
  // order within each group.
  results.sort((a, b) => Number(a.transpileOnly) - Number(b.transpileOnly));

  const json = {
    generatedAt: new Date().toISOString(),
    rootA: args.rootA,
    rootB: args.rootB,
    labelA: args.labelA,
    labelB: args.labelB,
    fileCount: args.fileCount,
    warmup: args.warmup,
    iterations: args.iterations,
    results,
  };
  fs.writeFileSync(path.join(args.benchmarkDir, 'benchmark-results.json'), JSON.stringify(json, null, 2));

  const markdown = toMarkdown(results, args);
  fs.writeFileSync(path.join(args.benchmarkDir, 'benchmark-results.md'), markdown);

  console.log('');
  console.log(markdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
