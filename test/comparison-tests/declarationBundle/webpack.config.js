module.exports = {
    entry: './src/app.ts',
    output: {
        filename: 'out1/bundle.js'
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
                        out: 'out1/bundle.d.ts',
                        moduleName: 'MyApp'
                    }           
                }                
            }
        ]
    }
}
