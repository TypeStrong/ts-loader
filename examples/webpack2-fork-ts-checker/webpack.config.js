'use strict';

var process = require('process');
var ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
    context: __dirname, // to automatically find tsconfig.json
    entry: './src/index.ts',
    output: { filename: 'index.js' },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
                options: {
                    transpileOnly: true // IMPORTANT! use transpileOnly mode to speed-up compilation
                }
            }
        ]
    },
    resolve: {
        extensions: [ '.ts', '.tsx' ]
    },
    plugins: [
        new ForkTsCheckerWebpackPlugin({
            tslint: false, // disable tslint support
            watch: './src', // optional but improves performance (less stat calls)
            workers: ForkTsCheckerWebpackPlugin.TWO_CPUS_FREE, // use multi-process mode, leave 2 cpu's free for builder and system
            blockEmit: process.env.NODE_ENV === 'production' // for production make it synchronous
        })
    ]
};
