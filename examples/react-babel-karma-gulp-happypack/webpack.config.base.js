/* eslint-disable no-var, strict, prefer-arrow-callback */
'use strict';

var path = require('path');
var webpack = require('webpack');
var ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
var HappyPack = require('happypack');

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
      loader: 'happypack/loader?id=ts'
    }, {
      test: /\.js$/,
      exclude: /node_modules/,
      loader: 'happypack/loader?id=js'
    }]
  },
  plugins: [
    new ForkTsCheckerWebpackPlugin({
      checkSyntacticErrors: true,
      tslint: true,
      watch: ['./src', './test'] // optional but improves performance (less stat calls)
    }),
    new HappyPack({
      id: 'ts',
      threads: 2,
      loaders: [
        {
          path: 'babel-loader',
          query: babelOptions
        },
        {
          path: 'ts-loader',
          query: { happyPackMode: true }
        }
      ]
    }),
    new HappyPack({
      id: 'js',
      threads: 2,
      loaders: [
        {
          path: 'babel-loader',
          query: babelOptions
        }
      ]
    })
  ],
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: ['.ts', '.tsx', '.js']
  },
};
