// Smoke test for the oldest Node version in package.json `engines`, which the
// comparison/execution test harnesses can't run on. Builds a tiny project with
// webpack + ts-loader, runs the bundle, and checks type errors are reported.
const assert = require('assert');
const path = require('path');
const webpack = require('webpack');

/** @param {string} project */
function build(project) {
  const outputPath = path.join(__dirname, project, 'dist');
  return new Promise((resolve, reject) => {
    const compiler = webpack({
      mode: 'development',
      devtool: false,
      context: __dirname,
      entry: `./${project}/app.ts`,
      target: 'node',
      output: {
        path: outputPath,
        filename: 'bundle.js',
        libraryTarget: 'commonjs2',
      },
      resolve: { extensions: ['.ts', '.js'] },
      module: { rules: [{ test: /\.ts$/, loader: 'ts-loader' }] },
      resolveLoader: {
        alias: { 'ts-loader': path.join(__dirname, '../../index.js') },
      },
    });
    compiler.run((error, stats) => {
      compiler.close(() => {
        if (error) reject(error);
        else {
          const { errors } = stats.toJson({ all: false, errors: true });
          resolve({
            outputPath,
            errors: errors.map(e => (typeof e === 'string' ? e : e.message)),
          });
        }
      });
    });
  });
}

async function main() {
  console.log(`Running minimum Node tests on Node ${process.version}`);

  const { outputPath, errors } = await build('clean');
  assert.deepStrictEqual(
    errors,
    [],
    `expected a clean build, got:\n${errors.join('\n')}`,
  );
  assert.strictEqual(
    require(path.join(outputPath, 'bundle.js')).default,
    'Hello, ts-loader!',
  );
  console.log('clean build: ok');

  const { errors: typeErrors } = await build('typeError');
  assert.ok(
    typeErrors.some(message => message.includes('TS2345')),
    `expected a TS2345 type error, got:\n${typeErrors.join('\n')}`,
  );
  console.log('type error reported: ok');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
