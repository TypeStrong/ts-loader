var path = require('path')

module.exports = {
    entry: './src/app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        alias: { externalLib: path.join(__dirname, "./lib/externalLib.js") },
        extensions: ['', '.js', '.ts']
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: 'ts-loader' }
        ]
    },
    ts: {
        "files": [
            // The paths set here are relative to `process.cwd()`
            // but in the tests it is the root of the project.
            // So instead of `lib/externalLib.d.ts` we have to set:
            path.join(__dirname, "lib/externalLib.d.ts")
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': require('path').join(__dirname, "../../index.js") } }
