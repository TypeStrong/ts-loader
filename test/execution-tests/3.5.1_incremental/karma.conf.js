/* eslint-disable no-var, strict */
'use strict';
var webpackConfig = require('./webpack.config.js');
var makeKarmaConfig = require('../../karmaConfig');

module.exports = function(config) {
  config.set(
    makeKarmaConfig({
      config,
      webpackConfig,
      files: [
        // This ensures we have the es6 shims in place from babel and then loads all the tests
        'main.js'
      ]
    })
  );
};
