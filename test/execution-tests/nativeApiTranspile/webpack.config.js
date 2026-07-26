module.exports = {
    mode: 'development',
    entry: './src/app.ts',
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
                    experimentalNativeApi: true
                }
            }
        ]
    }
}

// for test harness purposes only
module.exports.resolveLoader = { alias: { 'ts-loader': require('path').join(__dirname, '../../../index.js') } }
