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
                test: /\.ts$/, loader: 'ts-loader', options: {
                    // ts-loader 9's signature, which ts-loader 10 refuses
                    resolveModuleName: (moduleName, containingFile, compilerOptions, compilerHost, parentResolver) =>
                        parentResolver(moduleName, containingFile, compilerOptions, compilerHost),
                }
            }
        ]
    }
}
