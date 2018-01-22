/* eslint-disable no-var, strict */
'use strict';
var webpackConfig = require('./webpack.config.js');
var reporterOptions = require('../../reporterOptions');

module.exports = function(config) {
  // Documentation: https://karma-runner.github.io/0.13/config/configuration-file.html
  config.set({
    browsers: [ 'ChromeHeadless' ],

    files: [
      // This ensures we have the es6 shims in place and then loads all the tests
      'main.js'
    ],

    port: 9876,

    frameworks: [ 'jasmine' ],

    logLevel: config.LOG_INFO, //config.LOG_DEBUG

    preprocessors: {
      'main.js': [ 'webpack', 'sourcemap' ]
    },

    webpack: {
      devtool: 'inline-source-map',
      module: webpackConfig.module,
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
    mochaReporter: reporterOptions
  });
};
