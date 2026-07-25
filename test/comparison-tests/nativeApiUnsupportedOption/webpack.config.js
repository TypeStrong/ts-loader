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
                    transpileOnly: true,
                    experimentalNativeApi: true,
                    compiler: 'typescript-native-preview',
                    getCustomTransformers: function () { return {}; }
                }
            }
        ]
    }
}
