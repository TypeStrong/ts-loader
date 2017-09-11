module.exports = {
    entry: './src/app.ts',
    output: {
        filename: 'dist/bundle.js'
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
                    declarationBundle: {
                        out: 'dist/bundle.d.ts',
                        moduleName: 'MyApp'
                    }           
                }                
            }
        ]
    }
}
