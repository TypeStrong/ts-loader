"use strict";

const PnpWebpackPlugin = require(`pnp-webpack-plugin`);

module.exports = {
  devtool: "inline-source-map",
  entry: "./src/index.ts",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: require.resolve("ts-loader"),
        options: PnpWebpackPlugin.tsLoaderOptions()
      }
    ]
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    plugins: [PnpWebpackPlugin]
  },
  resolveLoader: {
    plugins: [PnpWebpackPlugin.moduleLoader(module)]
  }
};
