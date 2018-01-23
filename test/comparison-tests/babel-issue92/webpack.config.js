module.exports = {
    mode: 'development',
    entry: './app',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
    module: {
        rules: [{
            test: /\.ts(x?)$/,
            exclude: /node_modules/,
            use: [
                {
                    loader: 'babel-loader',
                    options: {
                        "presets": [
                            [
                                "es2015",
                                {
                                    "modules": false
                                }
                            ]
                        ]
                    }
                },
                {
                    loader: 'ts-loader'
                }
            ]
        }]
    }
}


