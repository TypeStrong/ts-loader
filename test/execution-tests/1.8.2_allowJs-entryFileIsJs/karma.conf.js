/* eslint-disable no-var, strict */
'use strict';
var path = require('path');
var webpack = require('webpack');
var webpackConfig = require('./webpack.config.js');

module.exports = function(config) {
  config.set({
    browsers: [ 'ChromeHeadless' ],

    files: [
      // This loads all the tests
      './**/*.tests.js'
    ],

    port: 9876,

    frameworks: [ 'jasmine' ],

    logLevel: config.LOG_INFO, //config.LOG_DEBUG

    preprocessors: {
      './**/*.js': [ 'webpack', 'sourcemap' ]
    },

    webpack: {
      devtool: 'inline-source-map',
      module: {
          loaders: webpackConfig.module.loaders
      },
      resolve: webpackConfig.resolve,

      // for test harness purposes only, you would not need this in a normal project
      resolveLoader: webpackConfig.resolveLoader
    },

    webpackMiddleware: {
      quiet: true,
      stats: {
        colors: true
      }
    },

    // reporter options
    mochaReporter: {
      colors: {
        success: 'bgGreen',
        info: 'cyan',
        warning: 'bgBlue',
        error: 'bgRed'
      }
    }
  });
};
