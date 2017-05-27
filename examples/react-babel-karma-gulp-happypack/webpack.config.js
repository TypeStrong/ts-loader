'use strict';

var path = require('path');
var HappyPack = require('happypack');

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
    vendor: [
      'babel-polyfill',
      'fbemitter',
      'flux',
      'react',
      'react-dom'
    ]
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
    extensions: ['.ts', '.tsx', '.js']
  },
};
