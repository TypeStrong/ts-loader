var path = require('path');
var aliasLoader = require('../../aliasLoader');

var config = {
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
            { test: /\.js$/, loader: 'ts-loader' }
        ]
    }
};

module.exports = config;

// for test harness purposes only, you would not need this in a normal project
var tsLoaderPath = require('path').join(__dirname, "../../../index.js");
aliasLoader(config, tsLoaderPath, {});
