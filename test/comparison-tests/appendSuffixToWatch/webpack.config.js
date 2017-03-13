module.exports = {
    stats: "errors-only",
    entry: {
        entry1: './entry1.ts',
        entry2: './entry2.ts'
    },
    output: {
        filename: 'bundle.[name].js'
    },
    resolve: {
        extensions: ['.js', '.ts', '.vue']
    },
    module: {
        rules: [
            {
                test: /\.ts$|\.vue$/,
                use: [{
                  loader: 'ts-loader',
                  options: { appendTsSuffixTo: [/\.vue$/] }
                }]

            }
        ]
    }
};