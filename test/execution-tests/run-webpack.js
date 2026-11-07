'use strict';

// Builds the webpack.config.js in the current directory once, like `webpack --bail`,
// so the execution tests don't need webpack-cli. Exits with 1 if the build has errors.
// Like webpack-cli, the config can export an object, an array, a function or a Promise.
const path = require('path');
const webpack = require('webpack');

const exported = require(path.resolve('webpack.config.js'));
const env = { WEBPACK_BUNDLE: true, WEBPACK_BUILD: true };

Promise.resolve(typeof exported === 'function' ? exported(env, { env: env }) : exported)
    .then(function (config) {
        (Array.isArray(config) ? config : [config]).forEach(function (c) { c.bail = true; });
        webpack(config, /**
         * An array of configs gives MultiStats.
         * @param {Error | null | undefined} err
         * @param {import('webpack').Stats | import('webpack').MultiStats | undefined} stats
         */ function (err, stats) {
            if (err || !stats) {
                console.error(err || new Error('webpack returned no stats'));
                process.exitCode = 1;
                return;
            }
            const options = 'stats' in stats
                ? { children: stats.stats.map(function (s) { return statsOptions(s.compilation); }) }
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
    .catch(function (err) {
        console.error(err);
        process.exitCode = 1;
    });

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
