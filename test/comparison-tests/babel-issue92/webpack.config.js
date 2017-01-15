var path = require('path')

module.exports = {
    entry: './app',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
    module: {
        loaders: [
            { test: /\.tsx?$/, loader: 'babel-loader?presets[]=es2015!ts-loader' }
        ]
    }
}


