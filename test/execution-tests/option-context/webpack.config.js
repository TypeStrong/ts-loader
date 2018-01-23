/* eslint-disable no-var, strict, prefer-arrow-callback */
'use strict';

var path = require('path');
var webpack = require('webpack');

module.exports = {
  mode: 'development',
  entry: './src/main.tsx',
  output: {
      filename: 'bundle.js'
  },
  module: {
    rules: [{
      test: /\.ts(x?)$/,
      use: [
        {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            presets: [require.resolve('babel-preset-react-app')]
          }
        },
        {
          loader: 'ts-loader',
          options: {
            context: __dirname,
            onlyCompileBundledFiles: true,
            configFile: require.resolve('./tsconfig-container/tsconfig.json')
          }
        }
      ]
    }, {
      test: /\.js$/,
      use: [
        {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            presets: [require.resolve('babel-preset-react-app')]
          }
        }
      ]
    }]
  },
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: ['.ts', '.tsx', '.js']
  }
};

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': path.join(__dirname, "../../../index.js") } }