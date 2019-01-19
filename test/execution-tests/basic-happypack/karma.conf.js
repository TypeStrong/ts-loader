/* eslint-disable no-var, strict */
'use strict';
var webpackConfig = require('./webpack.config.js');
var makeKarmaConfig = require('../../karmaConfig');

module.exports = function(config) {
  config.set(
    Object.assign(
      {},
      makeKarmaConfig({
        config,
        webpackConfig,
        files: [
          // This ensures we have the es6 shims in place from babel and then loads all the tests
          'main.js'
        ]
      }),
      {
        webpack: {
          devtool: 'inline-source-map',
          mode: webpackConfig.mode,
          module: webpackConfig.module,
          resolve: webpackConfig.resolve,
          plugins: webpackConfig.plugins,

          // for test harness purposes only, you would not need this in a normal project
          resolveLoader: webpackConfig.resolveLoader
        }
      }
    )
  );
};
