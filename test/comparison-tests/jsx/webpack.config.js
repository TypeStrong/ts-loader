module.exports = {
    entry: './app.tsx',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    externals: {
        react: true,
    },
    module: {
        rules: [
            { test: /\.ts(x?)$/, loader: 'ts-loader' }
        ]
    }
}


