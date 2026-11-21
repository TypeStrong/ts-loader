var path = require('path');

module.exports = {
    mode: 'development',
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    // dep.ts is restored from here, not compiled, by the builds of the patches
    cache: {
        type: 'filesystem',
        cacheDirectory: path.join(__dirname, '.cache')
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            { test: /\.ts$/, loader: 'ts-loader' }
        ]
    }
}
