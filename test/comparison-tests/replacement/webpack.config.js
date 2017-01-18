var webpack = require('webpack')

module.exports = {
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
        new webpack.NormalModuleReplacementPlugin(/a\.ts$/, './sub/a.ts')
    ]
}


