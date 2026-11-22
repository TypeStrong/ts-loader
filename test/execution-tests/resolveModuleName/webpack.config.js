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
                resolveModuleName: (moduleName, containingFile, compilerOptions, compilerHost, parentResolver) => {
                    switch (moduleName) {
                        case 'foo': return parentResolver(path.join(__dirname, 'foo-pkg'), containingFile, compilerOptions, compilerHost);
                        case 'bar': return parentResolver(path.join(__dirname, 'bar-pkg'), containingFile, compilerOptions, compilerHost);
                        case 'baz': return parentResolver(path.join(__dirname, 'baz-pkg'), containingFile, compilerOptions, compilerHost);
                        default: return parentResolver(moduleName, containingFile, compilerOptions, compilerHost);
                    }
                },
            } }
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': path.join(__dirname, "../../../index.js") } }
