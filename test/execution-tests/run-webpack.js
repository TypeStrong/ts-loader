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
            console.log(stats.toString({ colors: true }));
            if (stats.hasErrors()) {
                process.exitCode = 1;
            }
        });
    })
    .catch(function (err) {
        console.error(err);
        process.exitCode = 1;
    });
