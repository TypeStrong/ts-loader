module.exports = {
    entry: './index',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts']
    },
    module: {
        rules: [{
            test: /\.ts$/,
            exclude: /node_modules/,
            use: [
                {
                    loader: 'ts-loader',
                    options: {
                        configFile: './config/tsconfig.json'
                    }
                }
            ]
        }]
    }
}


