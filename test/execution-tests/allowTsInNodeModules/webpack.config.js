var path = require('path')

module.exports = {
    mode: 'development',
    entry: [
        './src/whitelisted.ts',
        './src/whitelisted_file.ts'
    ],
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            { test: /\.ts$/, loader: 'ts-loader', options: { allowTsInNodeModules: true } }
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': path.join(__dirname, "../../../index.js") } }