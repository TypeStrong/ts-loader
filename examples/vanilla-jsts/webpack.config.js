'use strict';

module.exports = {
    devtool: 'inline-source-map',
    entry: './src/index.js',
    output: { filename: 'dist/index.js' },
    module: {
        rules: [
            {
                test: /\.(ts|js)?$/,
                loader: 'ts-loader',
                options: {
                    entryFileIsJs: true,
                }
            }
        ]
    },
    resolve: {
        extensions: [ '.ts', '.js' ]
    }
};
