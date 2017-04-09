module.exports = {
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', 'tsx', '.js']
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                loader: 'css-loader',
                options: {
                    modules: true,
                    camelCase: true
                }
            },
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
                options: {
                    cssModules: {
                        test: /\.css$/,
                        save: true
                    }
                }

            }
        ]
    }
}


