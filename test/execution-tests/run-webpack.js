'use strict';

// Builds the webpack.config.js in the current directory once, like `webpack --bail`,
// so the execution tests don't need webpack-cli. Exits with 1 if the build has errors.
// Like webpack-cli, the config can export an object, a function or a Promise, or an
// array of them.
const path = require('path');
const webpack = require('webpack');

const exported = require(path.resolve('webpack.config.js'));
const env = { WEBPACK_BUNDLE: true, WEBPACK_BUILD: true };
// What webpack-cli passes a config function for `webpack --bail`
const argv = { env, bail: true };

// Starting from Promise.resolve() means a config function that throws is caught below
Promise.resolve()
    .then(() => resolveConfig(exported))
    .then((config) => (Array.isArray(config) ? Promise.all(config.map(resolveConfig)) : config))
    .then((config) => {
        (Array.isArray(config) ? config : [config]).forEach((c) => { c.bail = true; });
        webpack(config, /**
         * An array of configs gives MultiStats.
         * @param {Error | null | undefined} err
         * @param {import('webpack').Stats | import('webpack').MultiStats | undefined} stats
         */ (err, stats) => {
            if (err || !stats) {
                console.error(err || new Error('webpack returned no stats'));
                process.exitCode = 1;
                return;
            }
            const options = 'stats' in stats
                ? { children: stats.stats.map((s) => statsOptions(s.compilation)) }
                : statsOptions(stats.compilation);
            const output = stats.toString(options);
            if (output) {
                console.log(output);
            }
            if (stats.hasErrors()) {
                process.exitCode = 1;
            }
        });
    })
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    });

/** Calls a config function (which may return a Promise) as webpack-cli does. */
function resolveConfig(config) {
    return typeof config === 'function' ? config(env, argv) : config;
}

/**
 * The config's own `stats` setting, as webpack-cli uses it: colors only when
 * stdout is a terminal, unless the config says otherwise.
 */
function statsOptions(compilation) {
    const stats = compilation.compiler.options.stats;
    // webpack 4 keeps presets like 'errors-only' as strings; webpack 5 normalises them to objects
    if (typeof stats !== 'object' || stats === null) {
        return stats;
    }
    return Object.assign({ colors: !!process.stdout.isTTY }, stats);
}
