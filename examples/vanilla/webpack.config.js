'use strict';

module.exports = {
    entry: './src/index.ts',
    output: { filename: 'dist/index.js' },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'ts-loader'
            }
        ]
    },
    resolve: {
        extensions: [ '.ts', '.tsx', 'js' ]
    }
};
