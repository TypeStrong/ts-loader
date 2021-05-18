module.exports = {
    mode: 'development',
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts']
    },
    module: {
        rules: [
            {
                test: /submodule-es6.*\.ts$/,
                loader: 'ts-loader',
                options: {
                    compilerOptions: {
                        target: 'es6',
                    },
                },
            },
            {
                test: /submodule-es5.*\.ts$/,
                loader: 'ts-loader',
                options: {
                    compilerOptions: {
                        target: 'es5',
                    },
                },
            }
        ]
    }
}
