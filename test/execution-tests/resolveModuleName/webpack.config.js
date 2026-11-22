var path = require('path')

module.exports = {
    mode: 'development',
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.js'],
        alias: { baz: path.join(__dirname, 'baz-pkg') },
    },
    module: {
        rules: [
            { test: /\.ts$/, loader: 'ts-loader', options: {
                resolveModuleName: (moduleName, containingDirectory, context) => {
                    switch (moduleName) {
                        case 'foo': return context.resolveDefault(path.join(__dirname, 'foo-pkg'));
                        case 'bar': return context.resolveDefault(path.join(__dirname, 'bar-pkg'));
                        case 'baz': return context.resolveDefault(path.join(__dirname, 'baz-pkg'));
                    }
                },
            } }
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': path.join(__dirname, "../../../index.js") } }
