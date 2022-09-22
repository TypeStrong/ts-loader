var webpack = require('webpack');

module.exports = {
    mode: 'development',
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [{
            test: /\.ts$/,
            loader: '../../index.js'
        }]
    },
    plugins: [
        new webpack.IgnorePlugin(
            {
                resourceRegExp: /\.d\.ts$/
            })
    ]
};
