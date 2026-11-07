'use strict';

// Builds the webpack.config.js in the current directory once, like `webpack --bail`,
// so the execution tests don't need webpack-cli. Exits with 1 if the build has errors.
var path = require('path');
var webpack = require('webpack');

var config = require(path.resolve('webpack.config.js'));
config.bail = true;

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
