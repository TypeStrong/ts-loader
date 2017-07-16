/* eslint-disable no-var, strict, prefer-arrow-callback */
'use strict';

var path = require('path');
var webpack = require('webpack');
var ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

var packageJson = require('./package.json');
var vendorDependencies = Object.keys(packageJson['dependencies']);

var threadLoader = {
  loader: 'thread-loader',
  options: {
    // there should be 1 cpu for the fork-ts-checker-webpack-plugin
    workers: require('os').cpus().length - 1,
  },
};

var babelLoader = {
  loader: 'babel-loader',
  options: {
    cacheDirectory: true,
    presets: [
      "react",
      [
        "es2015",
        {
          "modules": false
        }
      ],
      "es2016"
    ]
  }
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
        { loader: 'cache-loader' },
        threadLoader,
        babelLoader,
        {
          loader: 'ts-loader',
          options: { happyPackMode: true }
        }
      ]
    }, {
      test: /\.js$/,
      exclude: /node_modules/,
      use: [
        { loader: 'cache-loader' },
        threadLoader,
        babelLoader
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
