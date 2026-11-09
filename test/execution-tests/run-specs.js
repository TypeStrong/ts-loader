'use strict';

// Run from a test's directory. Builds the test's main.js (which loads its specs)
// for Node, using the module, resolve and resolveLoader settings from the test's
// webpack.config.js, then runs the bundle with Jasmine. Exits with 1 if the build
// has errors or any spec fails (or no specs ran).
//
//   node run-specs.js           build once and run the specs in this process
//   node run-specs.js --watch   rebuild on changes; run the specs in a fresh process each time
//                               (so a debugger attached to this process won't stop in the specs)
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs } = require('util');
const webpack = require('webpack');

const { values } = parseArgs({
    options: {
        watch: { type: 'boolean' },
        // Internal: used by --watch to run an already built bundle
        run: { type: 'string' },
    },
});

if (values.run) {
    runSpecs(values.run).then(setExitCode, reportError).then(exit);
} else {
    const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-loader-execution-test-'));
    // 'exit' also fires after an uncaught error, such as a webpack.config.js that throws.
    // These signals don't fire it by themselves, so exit explicitly on them.
    process.on('exit', () => {
        try {
            fs.rmSync(outputPath, { recursive: true, force: true });
        } catch {
            // e.g. on Windows, if a spec process stopped on Ctrl+C still has the bundle open
        }
    });
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.on(signal, () => process.exit(1));
    }
    const bundlePath = path.join(outputPath, 'main.js');
    const compiler = webpack(makeConfig(require(path.resolve('webpack.config.js')), outputPath));
    if (!compiler) {
        throw new Error('webpack returned no compiler');
    }
    if (values.watch) {
        watch(compiler, bundlePath);
    } else {
        build(compiler)
            .then((built) => (built ? runSpecs(bundlePath) : false))
            .then(setExitCode, reportError)
            .then(exit);
    }
}

/**
 * @param {import('webpack').Configuration} webpackConfig
 * @param {string} outputPath
 * @returns {import('webpack').Configuration}
 */
function makeConfig(webpackConfig, outputPath) {
    return {
        mode: webpackConfig.mode,
        entry: path.resolve('main.js'),
        target: 'node',
        devtool: 'inline-source-map',
        output: { path: outputPath, filename: 'main.js' },
        module: webpackConfig.module,
        resolve: webpackConfig.resolve,
        // for test harness purposes only: this is how the test resolves the local ts-loader
        resolveLoader: webpackConfig.resolveLoader,
    };
}

/**
 * @param {import('webpack').Compiler} compiler
 * @returns {Promise<boolean>} whether the build had no errors
 */
function build(compiler) {
    return new Promise((resolve, reject) => {
        compiler.run((err, stats) => {
            if (err || !stats) {
                reject(err || new Error('webpack returned no stats'));
                return;
            }
            const succeeded = reportBuild(stats);
            // webpack 4 has no compiler.close
            if (typeof compiler.close === 'function') {
                compiler.close(() => resolve(succeeded));
            } else {
                resolve(succeeded);
            }
        });
    });
}

/**
 * @param {import('webpack').Compiler} compiler
 * @param {string} bundlePath
 */
function watch(compiler, bundlePath) {
    /** @type {import('child_process').ChildProcess | undefined} */
    let specProcess;
    function stopSpecs() {
        if (specProcess) {
            specProcess.kill();
            specProcess = undefined;
        }
    }
    // Stop the previous run as soon as a file changes, so its output can't be
    // mistaken for the result of the new edit (even if the rebuild then fails)
    compiler.hooks.invalid.tap('run-specs', stopSpecs);
    // Before the temp folder is deleted on exit, as the specs load from it
    process.prependListener('exit', stopSpecs);
    compiler.watch({}, (err, stats) => {
        if (err || !stats) {
            reportError(err || new Error('webpack returned no stats'));
            return;
        }
        if (!reportBuild(stats)) {
            return;
        }
        // A fresh process each time, so Jasmine's globals and Node's module cache start clean
        specProcess = childProcess.spawn(process.execPath, [__filename, '--run', bundlePath], { stdio: 'inherit' });
    });
}

/**
 * Prints errors and warnings.
 * @param {import('webpack').Stats} stats
 * @returns {boolean} whether the build had no errors
 */
function reportBuild(stats) {
    const output = stats.toString({ all: false, errors: true, warnings: true, colors: !!process.stdout.isTTY });
    if (output) {
        console.log(output);
    }
    return !stats.hasErrors();
}

/**
 * @param {string} bundlePath
 * @returns {Promise<boolean>} whether every spec passed
 */
async function runSpecs(bundlePath) {
    // Stack traces then point at the TypeScript source, through the bundle's inline source map
    process.setSourceMapsEnabled(true);
    const Jasmine = require('jasmine');
    const runner = new Jasmine();
    runner.exitOnCompletion = false;
    const result = await runner.execute([bundlePath]);
    // 'incomplete' means no specs ran, or a focused spec (fit/fdescribe) skipped the rest
    return result.overallStatus === 'passed';
}

/** @param {boolean} passed */
function setExitCode(passed) {
    if (!passed) {
        process.exitCode = 1;
    }
}

/**
 * Exits once the specs have finished, even if one left a timer or socket open,
 * so a run can't hang (as Karma's single run couldn't).
 */
function exit() {
    process.exit();
}

/** @param {unknown} err */
function reportError(err) {
    console.error(err);
    process.exitCode = 1;
}
