'use strict';

var process = require('process');
var HappyPack = require('happypack');
var ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
    context: __dirname, // to automatically find tsconfig.json
    entry: './src/index.ts',
    output: { filename: 'index.js' },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                loader: 'happypack/loader?id=ts'
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.tsx', 'js']
    },
    plugins: [
        new HappyPack({
            id: 'ts',
            threads: 2,
            loaders: [
                {
                    path: 'ts-loader',
                    query: { happyPackMode: true }
                }
            ]
        }),
        new ForkTsCheckerWebpackPlugin({
            tslint: false, // disable tslint support
            watch: './src', // optional but improves performance (less stat calls)
            workers: ForkTsCheckerWebpackPlugin.TWO_CPUS_FREE, // use multi-process mode, leave 2 cpu's free for builder and system
            blockEmit: process.env.NODE_ENV === 'production' // for production make it synchronous
        })
    ]
};
