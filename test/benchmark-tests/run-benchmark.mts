import fs from 'node:fs';
import path from 'node:path';
import { generateFixture } from './generate-fixture.mts';
import type { FixtureMeta } from './generate-fixture.mts';
import { buildWebpackConfig, runColdBuild, createWatchSession, withTimeout, touchFile } from './scenarios.mts';

const WARMUP_ITERATIONS = 2;
const MEASURED_ITERATIONS = 6;
const INITIAL_BUILD_TIMEOUT_MS = 120000;
const REBUILD_TIMEOUT_MS = 30000;
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

interface ColdScenarioOptions {
  id: string;
  label: string;
  transpileOnly: boolean;
  fixtureMetaA: FixtureMeta;
  fixtureMetaB: FixtureMeta;
  args: Args;
  outRoot: string;
}

async function runColdScenario({
  id,
  label,
  transpileOnly,
  fixtureMetaA,
  fixtureMetaB,
  args,
  outRoot,
}: ColdScenarioOptions): Promise<ScenarioResult> {
  const configFor = (root: string, meta: FixtureMeta, rootLabel: Side) =>
    buildWebpackConfig({
      fixtureDir: meta.fixtureDir,
      tsconfigPath: meta.tsconfigPath,
      entryFile: meta.entryFile,
      tsLoaderRoot: root,
      transpileOnly,
      outputPath: path.join(outRoot, rootLabel, id),
    });
  const configA = configFor(args.rootA, fixtureMetaA, 'a');
  const configB = configFor(args.rootB, fixtureMetaB, 'b');

  const total = args.warmup + args.iterations;
  const durations: { a: number[]; b: number[] } = { a: [], b: [] };
  for (let i = 0; i < total; i++) {
    const order: Side[] = i % 2 === 0 ? ['a', 'b'] : ['b', 'a'];
    for (const side of order) {
      const config = side === 'a' ? configA : configB;
      const ms = await withTimeout(runColdBuild(config), INITIAL_BUILD_TIMEOUT_MS, `${id} cold build (${side})`);
      durations[side].push(ms);
    }
  }
  return summarize({ id, label, transpileOnly, durations, warmup: args.warmup });
}

interface IncrementalScenarioOptions {
  id: string;
  label: string;
  transpileOnly: boolean;
  touchKey: 'leaf' | 'hub';
  fixtureMetaA: FixtureMeta;
  fixtureMetaB: FixtureMeta;
  args: Args;
  outRoot: string;
}

async function runIncrementalScenario({
  id,
  label,
  transpileOnly,
  touchKey,
  fixtureMetaA,
  fixtureMetaB,
  args,
  outRoot,
}: IncrementalScenarioOptions): Promise<ScenarioResult> {
  const configFor = (root: string, meta: FixtureMeta, rootLabel: Side) =>
    buildWebpackConfig({
      fixtureDir: meta.fixtureDir,
      tsconfigPath: meta.tsconfigPath,
      entryFile: meta.entryFile,
      tsLoaderRoot: root,
      transpileOnly,
      outputPath: path.join(outRoot, rootLabel, id),
    });

  // Independent fixture copies per side (fixtureMetaA/B point at separate
  // directories) so touching the file for side A's watcher never triggers
  // side B's - otherwise two live watchers sharing one fixture dir would
  // cross-contaminate each other's rebuild timings.
  const sessionA = await withTimeout(
    createWatchSession(configFor(args.rootA, fixtureMetaA, 'a')),
    INITIAL_BUILD_TIMEOUT_MS,
    `${id} initial build (a)`
  );
  const sessionB = await withTimeout(
    createWatchSession(configFor(args.rootB, fixtureMetaB, 'b')),
    INITIAL_BUILD_TIMEOUT_MS,
    `${id} initial build (b)`
  );

  try {
    const total = args.warmup + args.iterations;
    const durations: { a: number[]; b: number[] } = { a: [], b: [] };
    for (let i = 0; i < total; i++) {
      const order: Side[] = i % 2 === 0 ? ['a', 'b'] : ['b', 'a'];
      for (const side of order) {
        const session = side === 'a' ? sessionA : sessionB;
        const meta = side === 'a' ? fixtureMetaA : fixtureMetaB;
        const filePath = meta[`${touchKey}TouchFile`];
        const original = meta[`${touchKey}TouchOriginal`];
        const pending = withTimeout(session.nextCompile(), REBUILD_TIMEOUT_MS, `${id} rebuild (${side})`);
        touchFile(filePath, original, i);
        durations[side].push(await pending);
      }
    }
    return summarize({ id, label, transpileOnly, durations, warmup: args.warmup });
  } finally {
    await sessionA.close();
    await sessionB.close();
  }
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

  // Interleaved as cold(typeCheck), cold(transpileOnly), leaf(typeCheck),
  // leaf(transpileOnly), ... rather than grouped into a typeCheck block
  // followed by a transpileOnly block - a transient host-noise burst during
  // one contiguous block would otherwise bias that mode's rows without
  // touching the other's. Sorted back into typeCheck-then-transpileOnly
  // order below for a stable, readable report.
  const results: ScenarioResult[] = [];

  for (const transpileOnly of [false, true]) {
    const mode = transpileOnly ? 'transpileOnly' : 'typeCheck';
    console.log(`Running cold build (${mode})...`);
    results.push(
      await runColdScenario({
        id: `cold-${mode}`,
        label: 'Cold build',
        transpileOnly,
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
      await runIncrementalScenario({
        id: `incremental-leaf-${mode}`,
        label: 'Incremental rebuild (leaf touch)',
        transpileOnly,
        touchKey: 'leaf',
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
      await runIncrementalScenario({
        id: `incremental-hub-${mode}`,
        label: 'Incremental rebuild (hub touch)',
        transpileOnly,
        touchKey: 'hub',
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
