'use strict';

var webpack = require('webpack');
var webpackFailPlugin = require('webpack-fail-plugin');
var webpackConfig = require('./webpack.config.base.js');

module.exports = function() {
  var myProdConfig = webpackConfig;
  myProdConfig.output.filename = '[name].[hash].js';

  myProdConfig.plugins = [
    new webpack.DefinePlugin({
      'process.env': {
        'NODE_ENV': JSON.stringify('production')
      }
    }),
    new webpack.optimize.CommonsChunkPlugin({ name: 'vendor', filename: 'vendor.[hash].js' }),
    new webpack.optimize.UglifyJsPlugin({
      compress: {
        warnings: true
      }
    }),
    webpackFailPlugin
  ];

  return myProdConfig;
};
