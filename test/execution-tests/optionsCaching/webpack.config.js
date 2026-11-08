var path = require('path')

module.exports = {
    mode: 'development',
    entry: path.resolve(__dirname, 'foo.ts'),
    output: {
        path: __dirname,
        filename: 'bundle.js'
    },
    module: {
        rules: [
            { test: /\.ts$/, loader: 'ts-loader', options: {} },
            {
                test: /\.vue$/,
                loader: 'ts-loader',
                options: {
                    appendTsxSuffixTo: [/\.vue$/]
                }
            }
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': require('path').join(__dirname, "../../../index.js") } }
