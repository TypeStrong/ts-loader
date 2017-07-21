'use strict';

var ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
    context: __dirname, // to automatically find tsconfig.json
    devtool: 'inline-source-map',
    entry: './src/index.ts',
    output: { filename: 'dist/index.js' },
    module: {
        rules: {
            test: /\.tsx?$/,
            use: [
                { loader: 'cache-loader' },
                {
                    loader: 'thread-loader',
                    options: {
                        // there should be 1 cpu for the fork-ts-checker-webpack-plugin
                        workers: require('os').cpus().length - 1,
                    },
                },
                {
                    loader: 'ts-loader',
                    options: {
                        happyPackMode: true // IMPORTANT! use happyPackMode mode to speed-up compilation and reduce errors reported to webpack
                    }
                }
            ]
        }
    },
    resolve: {
        extensions: ['.ts', '.tsx', 'js']
    },
    plugins: [
        new ForkTsCheckerWebpackPlugin()
    ]
};
