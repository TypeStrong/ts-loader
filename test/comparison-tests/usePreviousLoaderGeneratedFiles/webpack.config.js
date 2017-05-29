var path = require('path')

module.exports = {
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.js', '.slam']
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            silent: true
                        }
                    },
                    {
                        loader: './ts-slam-loader'
                    }
                ]
            }
        ]
    }
}
