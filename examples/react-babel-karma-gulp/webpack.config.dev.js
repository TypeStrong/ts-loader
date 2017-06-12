'use strict';

var webpack = require('webpack');
var WebpackNotifierPlugin = require('webpack-notifier');
var webpackConfig = require('./webpack.config.base.js');

module.exports = function() {
  var myDevConfig = webpackConfig;
  myDevConfig.devtool = 'inline-source-map';

  myDevConfig.plugins = [
    new webpack.optimize.CommonsChunkPlugin({ name: 'vendor', filename: 'vendor.js' }),
    new WebpackNotifierPlugin({ title: 'Webpack build', excludeWarnings: true })
  ];

  return myDevConfig;
};
