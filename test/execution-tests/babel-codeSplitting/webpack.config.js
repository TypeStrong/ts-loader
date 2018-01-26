'use strict';

var path = require('path');

var babelOptions = {
  "presets": [
    [
      "es2015",
      {
        "modules": false
      }
    ]
  ]
};

module.exports = {
    mode: 'development',
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
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
                    loader: 'ts-loader'
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
    resolve: {
        extensions: ['.ts', '.js']
    },
};

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': path.join(__dirname, "../../../index.js") } }