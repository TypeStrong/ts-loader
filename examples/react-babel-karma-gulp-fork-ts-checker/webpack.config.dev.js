'use strict';

var webpack = require('webpack');
var ForkTsCheckerNotifierWebpackPlugin = require('fork-ts-checker-notifier-webpack-plugin');
var webpackConfig = require('./webpack.config.base.js');

module.exports = function() {
  var myDevConfig = webpackConfig;
  myDevConfig.devtool = 'inline-source-map';

  myDevConfig.plugins = myDevConfig.plugins.concat(
    new webpack.optimize.CommonsChunkPlugin({ name: 'vendor', filename: 'vendor.js' }),
    new ForkTsCheckerNotifierWebpackPlugin({ title: 'Webpack build', excludeWarnings: true })
  );

  return myDevConfig;
};
