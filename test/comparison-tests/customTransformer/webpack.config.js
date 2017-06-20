var path = require('path')

// 1. import default from the plugin module
var createStyledComponentsTransformer = require('./uppercaseStringLiteralTransformer').default;

// 2. create a transformer;
// the factory additionally accepts an options object which described below
var styledComponentsTransformer = createStyledComponentsTransformer();

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
            {
                test: /\.ts$/,
                loader: 'ts-loader',
                options: {
                    getCustomTransformers: () => ({ // note parens
                        before: [styledComponentsTransformer]
                    })
                }
            }
        ]
    }
}


