var path = require('path')

module.exports = {
    mode: 'development',
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    module: {
        rules: [
            { test: /\.[cm]?ts$/, loader: 'ts-loader' }
        ]
    }
}


