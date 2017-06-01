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
                test: /\.html?$/,
                loader: './raw-loader'
            },
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
                        loader: './my-ts-html-loader'
                    }
                ]
            }
        ]
    }
}
