/* eslint-disable no-var, strict */
'use strict';
var path = require('path');
var webpack = require('webpack');
var webpackConfig = require('./webpack.config.js');
var reporterOptions = require('../../reporterOptions');

module.exports = function(config) {
  config.set({
    browsers: [ 'ChromeHeadless' ],

    files: [
      // This loads all the tests
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
