/* eslint-disable no-var, strict, prefer-arrow-callback */
"use strict";

var path = require("path");
var webpack = require("webpack");

module.exports = {
  mode: 'development',
  entry: "./app.ts",
  
  output: {
    path: path.join(__dirname, "dist"),
    filename: "[name].bundle.js",
    chunkFilename: "[name].chunk.js"
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "ts-loader"
      }
    ]
  },

  resolve: {
    extensions: [".ts", ".js"]
  },

  devServer: {
      contentBase: "./dist"
  }
};

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = {
  alias: { "ts-loader": path.join(__dirname, "../../../index.js") }
};
