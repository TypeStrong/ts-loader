/* eslint-disable no-var, strict, prefer-arrow-callback */
'use strict';

var path = require('path');
var webpack = require('webpack');
var ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

var packageJson = require('./package.json');
var vendorDependencies = Object.keys(packageJson['dependencies']);

var babelOptions = {
  "presets": [
    "react",
    [
      "es2015",
      {
        "modules": false
      }
    ],
    "es2016"
  ]
};

module.exports = {
  cache: true,
  entry: {
    main: './src/main.tsx',
    vendor: vendorDependencies
  },
  output: {
    path: path.resolve(__dirname, './dist/scripts'),
    filename: '[name].js',
    chunkFilename: '[chunkhash].js'
  },
  module: {
    rules: [{
      test: /\.ts(x?)$/,
      exclude: /node_modules/,
      use: [
        {
          loader: 'babel-loader',
          options: babelOptions
        },
        {
          loader: 'ts-loader',
          options: { transpileOnly: true }
        }
      ]
    }, {
      test: /\.js$/,
      exclude: /node_modules/,
      use: [
        {
          loader: 'babel-loader',
          options: babelOptions
        }
      ]
    }]
  },
  plugins: [
    new ForkTsCheckerWebpackPlugin({
      tslint: true,
      watch: ['./src', './test'] // optional but improves performance (less stat calls)
    })
  ],
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: ['.ts', '.tsx', '.js']
  },
};
