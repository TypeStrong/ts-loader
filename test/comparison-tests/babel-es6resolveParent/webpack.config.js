var path = require('path')

module.exports = {
    entry: './index',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
    module: {
        loaders: [
            { test: /\.tsx?$/, loader: 'babel-loader?presets[]=es2015&presets[]=react!ts-loader' }
        ]
    }
}


