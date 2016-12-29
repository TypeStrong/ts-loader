module.exports = {
    entry: './app.tsx',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['', '.tsx', '.ts', '.js']
    },
    externals: {
        react: true,
    },
    module: {
        loaders: [
            { test: /\.ts(x?)$/, loader: 'babel-loader?presets[]=react!ts-loader' }
        ]
    }
}


