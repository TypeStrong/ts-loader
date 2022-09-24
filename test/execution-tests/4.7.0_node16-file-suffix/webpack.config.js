var path = require('path')

module.exports = {
    mode: 'development',
    entry: './src/app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.js'],
        extensionAlias: {
            '.js': [
                '.js',
                '.ts'
            ],
            '.cjs': [
                '.cjs',
                '.cts'
            ],
            '.mjs': [
                '.mjs',
                '.mts'
            ]
        }
    },
    module: {
        rules: [
            { test: /\.[cm]?ts$/, loader: 'ts-loader' }
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': require('path').join(__dirname, "../../../index.js") } }