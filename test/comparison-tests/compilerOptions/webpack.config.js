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
                    // tsconfig.json has target es2022 and strict off
                    compilerOptions: { target: 'es2015', strict: true }
                }
            }
        ]
    }
}
