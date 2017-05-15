/* eslint-disable no-var, strict */
'use strict';

var webpackConfig = require('./webpack.config.js');

module.exports = function(config) {
  // Documentation: https://karma-runner.github.io/0.13/config/configuration-file.html
  config.set({
    browsers: [ 'PhantomJS' ],

    files: [
      // This ensures we have the es6 shims in place from babel and that angular and angular-mocks are loaded
      // and then loads all the tests
      'test/main.js'
    ],

    port: 9876,

    frameworks: [ 'jasmine' ],

    logLevel: config.LOG_INFO, //config.LOG_DEBUG

    preprocessors: {
      'test/main.js': [ 'webpack', 'sourcemap' ]
    },

    webpack: {
      devtool: 'inline-source-map',
      debug: true,
      module: webpackConfig.module,
      resolve: webpackConfig.resolve
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

    // the default configuration
    junitReporter: {
      outputDir: 'test-results', // results will be saved as $outputDir/$browserName.xml
      outputFile: undefined, // if included, results will be saved as $outputDir/$browserName/$outputFile
      suite: ''
    },

    coverageReporter: {
      reporters:[
        //{type: 'html', dir:'coverage/'},  // https://github.com/karma-runner/karma-coverage/issues/123
        {type: 'text'},
        {type: 'text-summary'}
      ],
    }
  });
};
