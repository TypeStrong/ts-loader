'use strict';

const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
    devtool: 'inline-source-map',
    entry: './src/index.ts',
    output: {
        pathinfo: false
    },
    mode: 'production',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [{
                    loader: 'ts-loader',
                    options: {
                        transpileOnly: false,
                    },
                }],
              }
        ]
    },
    resolve: {
        extensions: [ '.ts', '.tsx', '.js' ]
    },
    plugins: [
        new ForkTsCheckerWebpackPlugin()
    ]
};
