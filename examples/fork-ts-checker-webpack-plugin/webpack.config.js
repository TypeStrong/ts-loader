import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';

/** @type {import('webpack').Configuration} */
export default {
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        // ts-loader detects fork-ts-checker-webpack-plugin and sets `transpileOnly`
        // for you, so it only transpiles and the plugin reports the type errors.
        // This line is only here to illustrate that, and can be deleted.
        // options: { transpileOnly: true },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '...'],
  },
  plugins: [new ForkTsCheckerWebpackPlugin(), new HtmlWebpackPlugin()],
};
