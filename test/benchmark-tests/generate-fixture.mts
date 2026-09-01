import fs from 'node:fs';
import path from 'node:path';

// Deterministic PRNG (mulberry32) so the generated fixture is stable across runs.
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hubSource(): string {
  return `export interface HubValue {
  id: number;
  label: string;
}

export function describeHub(value: HubValue): string {
  return \`\${value.id}:\${value.label}\`;
}

export function combineHub(values: HubValue[]): HubValue {
  return values.reduce(
    (acc, v) => ({ id: acc.id + v.id, label: acc.label + v.label }),
    { id: 0, label: '' }
  );
}
`;
}

function leafSource(index: number): string {
  const name = `leaf${index}`;
  const resultType = `Leaf${index}Result`;
  return `import { HubValue, describeHub } from './hub';

export interface ${resultType} {
  value: number;
  description: string;
}

export function ${name}(seed: number): ${resultType} {
  const hubValue: HubValue = { id: seed + ${index}, label: '${name}' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
`;
}

function midSource(index: number, leafIndexes: number[]): string {
  const name = `mid${index}`;
  const resultType = `Mid${index}Result`;
  const imports = leafIndexes
    .map((i) => `import { leaf${i}, Leaf${i}Result } from './leaf${i}';`)
    .join('\n');
  const unionType = leafIndexes.map((i) => `Leaf${i}Result`).join(' | ');
  const calls = leafIndexes.map((i) => `leaf${i}(seed + ${i})`).join(', ');
  return `${imports}

export interface ${resultType} {
  results: (${unionType})[];
  total: number;
}

export function ${name}(seed: number): ${resultType} {
  const results: (${unionType})[] = [${calls}];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
`;
}

function entrySource(midCount: number): string {
  const imports: string[] = [];
  const calls: string[] = [];
  for (let i = 0; i < midCount; i++) {
    imports.push(`import { mid${i} } from './mid${i}';`);
    calls.push(`mid${i}(${i})`);
  }
  return `${imports.join('\n')}

const all = [${calls.join(', ')}];

// eslint-disable-next-line no-console
console.log(all.length);
`;
}

interface GenerateFixtureOptions {
  fixtureDir: string;
  fileCount?: number;
  seed?: number;
}

interface TouchTarget {
  file: string;
  original: string;
}

export interface FixtureMeta {
  fixtureDir: string;
  tsconfigPath: string;
  entryFile: string;
  touch: {
    leaf: TouchTarget;
    hub: TouchTarget;
  };
}

/**
 * Generates a synthetic ts-loader benchmark fixture on disk.
 *
 * Layout: one `hub` module imported by every leaf (touching it forces a
 * dependant recheck across most of the project), many independent `leaf`
 * modules (each imported by only a handful of `mid` modules), `mid` modules
 * that combine a few leaves, and a single entry point importing every mid.
 */
export function generateFixture({ fixtureDir, fileCount = 300, seed = 42 }: GenerateFixtureOptions): FixtureMeta {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  const srcDir = path.join(fixtureDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const rng = createRng(seed);

  // ~60% leaves, ~40% mids; hub + entry are additional to fileCount.
  const leafCount = Math.max(1, Math.round(fileCount * 0.6));
  const midCount = Math.max(1, fileCount - leafCount);

  fs.writeFileSync(path.join(srcDir, 'hub.ts'), hubSource());

  for (let i = 0; i < leafCount; i++) {
    fs.writeFileSync(path.join(srcDir, `leaf${i}.ts`), leafSource(i));
  }

  for (let i = 0; i < midCount; i++) {
    const leavesForThisMid = new Set<number>();
    const importCount = 2 + Math.floor(rng() * 3); // 2-4 leaves per mid
    while (leavesForThisMid.size < Math.min(importCount, leafCount)) {
      leavesForThisMid.add(Math.floor(rng() * leafCount));
    }
    fs.writeFileSync(
      path.join(srcDir, `mid${i}.ts`),
      midSource(i, [...leavesForThisMid].sort((a, b) => a - b))
    );
  }

  fs.writeFileSync(path.join(srcDir, 'index.ts'), entrySource(midCount));

  const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
  fs.writeFileSync(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: 'es2020',
          module: 'commonjs',
          moduleResolution: 'bundler',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          declaration: false,
          sourceMap: false,
        },
        include: ['src/**/*.ts'],
      },
      null,
      2
    )
  );

  const leafTouchFile = path.join(srcDir, 'leaf0.ts');
  const hubTouchFile = path.join(srcDir, 'hub.ts');

  return {
    fixtureDir,
    tsconfigPath,
    entryFile: path.join(srcDir, 'index.ts'),
    touch: {
      leaf: { file: leafTouchFile, original: fs.readFileSync(leafTouchFile, 'utf8') },
      hub: { file: hubTouchFile, original: fs.readFileSync(hubTouchFile, 'utf8') },
    },
  };
}
