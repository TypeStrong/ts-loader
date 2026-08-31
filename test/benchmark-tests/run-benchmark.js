'use strict';

const fs = require('fs');
const path = require('path');
const { generateFixture } = require('./generate-fixture');
const {
  buildWebpackConfig,
  runColdBuild,
  createWatchSession,
  withTimeout,
  touchFile,
} = require('./scenarios');

const WARMUP_ITERATIONS = 2;
const MEASURED_ITERATIONS = 6;
const INITIAL_BUILD_TIMEOUT_MS = 120000;
const REBUILD_TIMEOUT_MS = 30000;
const REGRESSION_FLAG_PCT = 10;

function parseArgs(argv) {
  const get = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i === -1 ? fallback : argv[i + 1];
  };
  const rootA = path.resolve(get('--root-a', process.cwd()));
  const rootB = path.resolve(get('--root-b', rootA));
  return {
    rootA,
    rootB,
    labelA: get('--label-a', 'A'),
    labelB: get('--label-b', 'B'),
    fileCount: Number(get('--files', 300)),
    warmup: Number(get('--warmup', WARMUP_ITERATIONS)),
    iterations: Number(get('--iterations', MEASURED_ITERATIONS)),
    benchmarkDir: path.resolve(get('--benchmark-dir', path.join(process.cwd(), '.benchmark'))),
  };
}

function median(values) {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values) {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function summarize({ id, label, transpileOnly, durations, warmup }) {
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

async function runColdScenario({ id, label, transpileOnly, fixtureMetaA, fixtureMetaB, args, outRoot }) {
  const configFor = (root, meta, rootLabel) =>
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
  const durations = { a: [], b: [] };
  for (let i = 0; i < total; i++) {
    const order = i % 2 === 0 ? ['a', 'b'] : ['b', 'a'];
    for (const side of order) {
      const config = side === 'a' ? configA : configB;
      const ms = await withTimeout(runColdBuild(config), INITIAL_BUILD_TIMEOUT_MS, `${id} cold build (${side})`);
      durations[side].push(ms);
    }
  }
  return summarize({ id, label, transpileOnly, durations, warmup: args.warmup });
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
}) {
  const configFor = (root, meta, rootLabel) =>
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
    const durations = { a: [], b: [] };
    for (let i = 0; i < total; i++) {
      const order = i % 2 === 0 ? ['a', 'b'] : ['b', 'a'];
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

function toMarkdown(results, args) {
  const lines = [
    `| Scenario | transpileOnly | ${args.labelA} median (ms) | ${args.labelB} median (ms) | Δ vs ${args.labelB} |`,
    '| --- | --- | --- | --- | --- |',
  ];
  for (const r of results) {
    const flag = Math.abs(r.deltaPct) >= REGRESSION_FLAG_PCT ? ' ⚠️' : '';
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

async function main() {
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

  const results = [];
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
