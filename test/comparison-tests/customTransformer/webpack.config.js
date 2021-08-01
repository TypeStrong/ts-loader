var path = require('path')

var uppercaseStringLiteralTransformer = require('./uppercaseStringLiteralTransformer').default;

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
                    getCustomTransformers: (program) => {
                        console.log('program.getSourceFiles():', program.getSourceFiles().map(x => x.fileName));
                        return ({
                            before: [uppercaseStringLiteralTransformer]
                        });
                    }
                }
            }
        ]
    }
}


