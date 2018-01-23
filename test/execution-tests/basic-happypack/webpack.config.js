var path = require('path');
var HappyPack = require('happypack');

module.exports = {
    mode: 'development',
    entry: './src/app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        alias: { externalLib: path.join(__dirname, "./lib/externalLib.js") },
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            { test: /\.ts$/, loader: 'happypack/loader?id=ts'}
        ]
    },
    plugins: [
        new HappyPack({
            id: 'ts',
            threads : 2,
            loaders: [ "ts-loader?" + JSON.stringify({happyPackMode: true}) ]
        })
    ]
};

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': require('path').join(__dirname, "../../../index.js") } }
