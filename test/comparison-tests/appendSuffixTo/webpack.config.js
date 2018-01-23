module.exports = {
    mode: 'development',
    entry: './index.vue',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.vue']
    },
    module: {
        loaders: [
            {
                test: /\.ts$|\.vue$/,
                loader: 'ts-loader',
                options: { appendTsSuffixTo: [/\.vue$/] }
            }
        ]
    }
}



