var path = require('path')

module.exports = {
    entry: './src/app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        alias: { externalLib: path.join(__dirname, "./lib/externalLib.js") },
        extensions: ['', '.ts', '.js']
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: 'ts-loader' }
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': require('path').join(__dirname, "../../../index.js") } }