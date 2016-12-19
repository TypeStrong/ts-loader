'use strict';

var path = require('path');

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
    loaders: [{
      test: /\.ts(x?)$/,
      exclude: /node_modules/,
      loader: 'babel-loader!ts-loader'
    }, {
      test: /\.js$/,
      exclude: /node_modules/,
      loader: 'babel-loader'
    }]
  },
  plugins: [
  ],
  resolve: {
    extensions: ['.ts', '.tsx', '.js']
  },
};
