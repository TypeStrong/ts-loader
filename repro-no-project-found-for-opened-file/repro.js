// Minimal, standalone repro for "no project found for opened file" - no
// ts-loader/webpack involved, just the raw `typescript/unstable/sync` API.
//
// Shape: a fresh API instance's very *first* createSnapshot call opens a
// project (openProjects) and, in that same request, opens a file that
// (a) doesn't exist on real disk and (b) isn't listed by that project's
// tsconfig - so it should fall back to the inferred project per
// SnapshotRequestChangesParams.openFiles's own doc comment.
//
// Run with: node repro.js
const path = require('path');
const { API } = require('typescript/unstable/sync');

const projectDir = __dirname;
const tsconfigPath = path.join(projectDir, 'tsconfig.json');

// Never written to real disk - served only via the fs overrides below.
// Content/extension don't matter; what matters is that it isn't part of
// the project's own file list.
const virtualFileName = path.join(projectDir, 'virtual.ts');
const virtualFiles = new Map([[virtualFileName, 'export const hello = "world";\n']]);

const api = new API({
  fs: {
    fileExists: fileName => (virtualFiles.has(fileName) ? true : undefined),
    readFile: fileName => virtualFiles.get(fileName),
  },
});

console.log(
  'Calling createSnapshot() with openProjects + openFiles for a file not in that project, as the very first call for this API instance...',
);

try {
  const snapshot = api.createSnapshot({
    openProjects: [tsconfigPath],
    openFiles: [virtualFileName],
  });
  console.log('No panic - snapshot created successfully:', !!snapshot);
} catch (error) {
  console.error('Reproduced the panic:\n');
  console.error(error.message);
  process.exitCode = 1;
}
