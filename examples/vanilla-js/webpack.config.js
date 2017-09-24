'use strict';

module.exports = {
    devtool: 'inline-source-map',
    entry: './src/index.js',
    output: { filename: 'dist/index.js' },
    module: {
        rules: [
            {
                test: /\.(ts|js)?$/,
                loader: 'ts-loader'
            }
        ]
    },
    resolve: {
        extensions: [ '.ts', '.js' ]
    }
};
