var path = require('path');
var aliasLoader = require('../../aliasLoader');

var options = {
    entryFileIsJs: true
};

var config = {
    entry: './src/app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        loaders: [
            { test: /\.js$/, loader: 'ts-loader' }
        ]
    }
};

module.exports = config;

// for test harness purposes only, you would not need this in a normal project
var tsLoaderPath = require('path').join(__dirname, "../../../index.js");
aliasLoader(config, tsLoaderPath, options);
