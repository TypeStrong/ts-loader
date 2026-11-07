'use strict';

// Builds the webpack.config.js in the current directory once, like `webpack --bail`,
// so the execution tests don't need webpack-cli. Exits with 1 if the build has errors.
// Like webpack-cli, the config can export an object, an array, a function or a Promise.
var path = require('path');
var webpack = require('webpack');

var exported = require(path.resolve('webpack.config.js'));
var env = { WEBPACK_BUNDLE: true, WEBPACK_BUILD: true };

Promise.resolve(typeof exported === 'function' ? exported(env, { env: env }) : exported)
    .then(function (config) {
        (Array.isArray(config) ? config : [config]).forEach(function (c) { c.bail = true; });
        webpack(config, function (err, stats) {
            if (err) {
                console.error(err);
                process.exitCode = 1;
                return;
            }
            var options = stats.stats
                ? { children: stats.stats.map(function (s) { return statsOptions(s.compilation); }) }
                : statsOptions(stats.compilation);
            var output = stats.toString(options);
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
    var stats = compilation.compiler.options.stats;
    // webpack 4 keeps presets like 'errors-only' as strings; webpack 5 normalises them to objects
    if (typeof stats !== 'object' || stats === null) {
        return stats;
    }
    return Object.assign({ colors: !!process.stdout.isTTY }, stats);
}
