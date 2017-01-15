var webpack = require('webpack');

module.exports = {
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: 'ts-loader' }
        ]
    },
    plugins: [
        // This plugin inlines "true" or "false" for DEBUG.
        // webpack is smart enough to know that a `require` call
        // inside an always false if statement should not be included
        // in the bundle.
        new webpack.DefinePlugin({
            //DEBUG: true
        }),
        // This plugin can additionally optimize dead code away
        // so that it's not taking up space.
        new webpack.optimize.UglifyJsPlugin({
            mangle: false,
            compress: {
                dead_code: true
            },
            beautify: true
        })
    ]
}


