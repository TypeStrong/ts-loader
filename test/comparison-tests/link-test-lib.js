// Links node_modules/lib to testLib for the npmLink test. Replaces
// `npm link`, which reifies the whole dependency tree.
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'testLib');
const linkPath = path.join(__dirname, '..', '..', 'node_modules', 'lib');

fs.rmSync(linkPath, { recursive: true, force: true });
// Junctions need no elevated permissions on Windows; ignored elsewhere.
fs.symlinkSync(target, linkPath, 'junction');
