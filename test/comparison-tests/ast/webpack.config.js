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
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: 'json-loader'
                    },
                    {
                        loader: 'ts-loader',
                        options: { ast: true }
                    }
                ]
            }
        ]
    }
}


