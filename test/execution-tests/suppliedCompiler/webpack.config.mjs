import { fileURLToPath } from "node:url";
import { API } from "typescript/sync";
import { createFileSystemLayer } from "typescript/fs";

export default {
  mode: "development",
  entry: "./app.ts",
  output: {
    filename: "bundle.js",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "ts-loader",
        options: {
          compiler: { API, createFileSystemLayer },
        },
      },
    ],
  },
  resolveLoader: {
    alias: {
      "ts-loader": fileURLToPath(new URL("../../../index.js", import.meta.url)),
    },
  },
};
