'use strict';

var gulp = require('gulp');
var gutil = require('gulp-util');
var webpack = require('webpack');

module.exports = {
    build: function (done) {
        var config = require('../webpack.config.prod.js')();
        return webpack(config, function (err, stats) {
            if (err) { throw new gutil.PluginError('webpack:build', err); }
            gutil.log('[webpack:build]', stats.toString({
                colors: true
            }));

            done();
        });
    },
    watch: function (done) {
        var started = false;
        var config = require('../webpack.config.dev.js')();
        return webpack(config).watch({ // watch options:
            aggregateTimeout: 300 // wait so long for more changes
        }, function (err, stats) {
            if (err) {
                throw new gutil.PluginError('webpack:build-dev', err);
            }
            if (!started) {
                done();
                started = true;
            }

            gutil.log('[webpack:build-dev]', stats.toString({
                chunks: false,
                colors: true
            }));
        });
    }
};
