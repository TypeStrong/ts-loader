var path = require('path')

module.exports = {
    entry: './index',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['', '.ts', '.tsx', '.js']
    },
    module: {
        loaders: [
            { test: /\.tsx?$/, loader: 'babel-loader?presets[]=es2015&presets[]=react!ts-loader' }
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': require('path').join(__dirname, "../../index.js") } }