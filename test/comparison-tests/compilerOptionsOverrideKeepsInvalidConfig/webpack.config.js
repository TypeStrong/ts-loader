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
                    // tsconfig.json sets mapRoot with nothing it needs, which is an error the override must not hide
                    compilerOptions: { declaration: false }
                }
            }
        ]
    }
}
