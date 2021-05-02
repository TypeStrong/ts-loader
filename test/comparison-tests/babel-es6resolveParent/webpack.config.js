module.exports = {
    mode: 'development',
    entry: './index',
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
                        "presets": ["@babel/preset-react", "@babel/preset-env"]
                    }
                },
                {
                    loader: 'ts-loader'
                }
            ]
        }]
    }
}


