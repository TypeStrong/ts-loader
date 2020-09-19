var path = require('path')

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
            { test: /(app|lib|common|indirect).+\.ts$/, loader: 'ts-loader', options: { projectReferences: true } },
            { test: /utils.+\.ts$/, loader: 'ts-loader', options: { instance: 'different', projectReferences: true } }
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': require('path').join(__dirname, "../../../../index.js") } }

