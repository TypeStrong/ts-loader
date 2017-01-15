var path = require('path')

module.exports = {
    entry: './src/app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        alias: { externalLib: path.join(__dirname, "./lib/externalLib.js") },
        extensions: ['.js', '.ts']
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: 'ts-loader' }
        ]
    }
}


