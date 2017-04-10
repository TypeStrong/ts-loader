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
                    camelCase: true,
                    localIdentName: '[path][name]-[local]'
                }
            },
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
                options: {
                    cssModules: /\.css$/,
                    saveCssModules: true
                }
            }
        ]
    }
}


