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
        rules: [
            { test: /\.ts$/, loader: 'ts-loader' }
        ]
    },
    plugins: [
        // This plugin inlines "true" or "false" for DEBUG.
        // webpack is smart enough to know that a `require` call
        // inside an always false if statement should not be included
        // in the bundle.
        new webpack.DefinePlugin({
            DEBUG: false
        })
    ]
}


