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
                    // tsconfig.json also sets inlineSources, which needs sourceMap
                    compilerOptions: { sourceMap: false }
                }
            }
        ]
    }
}
