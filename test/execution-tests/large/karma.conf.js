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
        // This loads all the tests
        'main.js'
      ]
    })
  );
};
