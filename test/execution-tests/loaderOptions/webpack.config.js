var path = require('path')

var uppercaseStringLiteralTransformer = require('./uppercaseStringLiteralTransformer').default;

module.exports = {
    mode: 'development',
    entry: './src/app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        alias: { externalLib: path.join(__dirname, "./lib/externalLib.js") },
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /submodule3\.ts$/,
                loader: 'ts-loader',
            },
            {
                test: /submodule2\.ts$/,
                loader: 'ts-loader',
                options: {
                    getCustomTransformers: (program) => ({
                        before: [uppercaseStringLiteralTransformer]
                    })
                },
            },
            {
                test: /\.ts$/,
                exclude: /submodule\d\.ts$/,
                loader: 'ts-loader',
            }
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': require('path').join(__dirname, "../../../index.js") } }