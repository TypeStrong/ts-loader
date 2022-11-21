var path = require('path');
var wasHereTransformer = require('./wasHereTransformer').default;

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
            {
                test: /\.ts$/,
                loader: 'ts-loader',
                options: {
                    projectReferences: true,
                    getCustomTransformers: (program) => ({
                        before: [wasHereTransformer]
                    })
                }
            }
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': require('path').join(__dirname, "../../../index.js") } }

