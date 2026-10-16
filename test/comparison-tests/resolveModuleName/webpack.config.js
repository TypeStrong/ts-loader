var path = require('path');

module.exports = {
    mode: 'development',
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            { test: /\.ts$/, loader: 'ts-loader', options: {
                resolveModuleName: function (moduleName, containingFile, compilerOptions, compilerHost, parentResolver) {
                    return moduleName === 'foo'
                        ? parentResolver(path.join(__dirname, 'foo-pkg'), containingFile, compilerOptions, compilerHost)
                        : parentResolver(moduleName, containingFile, compilerOptions, compilerHost);
                },
            } }
        ]
    }
}
