/* eslint-disable no-var, strict */
'use strict';

var webpackConfig = require('./webpack.config.js');
var ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
var ForkTsCheckerNotifierWebpackPlugin = require('fork-ts-checker-notifier-webpack-plugin');

module.exports = function (config) {
  var forkTsCheckerOptions = {
    blockEmit: true,
    watch: ['./test'] // optional but improves performance (less stat calls)
  };
  var plugins = config.singleRun
    ? [
      new ForkTsCheckerWebpackPlugin(forkTsCheckerOptions)
    ]
    : [
      new ForkTsCheckerNotifierWebpackPlugin({ title: 'Tests Build', excludeWarnings: false }),
      new ForkTsCheckerWebpackPlugin(Object.assign({}, forkTsCheckerOptions, { blockEmit: false }))
    ];

  // Documentation: https://karma-runner.github.io/0.13/config/configuration-file.html
  config.set({
    browsers: ['PhantomJS'],

    files: [
      // This ensures we have the es6 shims in place and then loads all the tests
      'test/main.js'
    ],

    port: 9876,

    frameworks: ['jasmine'],

    logLevel: config.LOG_INFO, //config.LOG_DEBUG

    preprocessors: {
      'test/main.js': ['webpack', 'sourcemap']
    },

    webpack: {
      devtool: 'inline-source-map',
      module: webpackConfig.module,
      resolve: webpackConfig.resolve,
      plugins: plugins
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
    },

    notifyReporter: {
      reportSuccess: false // Default: true, Will notify when a suite was successful
    }
  });
};
