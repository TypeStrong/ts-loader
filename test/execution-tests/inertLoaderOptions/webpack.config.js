var path = require('path');

module.exports = {
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
            {
                test: /\.ts$/,
                loader: 'ts-loader',
                options: {
                    // Each defers to TypeScript's own behaviour, so the build works
                    // whether or not ts-loader uses them
                    resolveModuleName: (moduleName, containingFile, compilerOptions, compilerHost, parentResolver) =>
                        parentResolver(moduleName, containingFile, compilerOptions, compilerHost),
                    resolveTypeReferenceDirective: (typeDirectiveName, containingFile, compilerOptions, compilerHost, parentResolver) =>
                        parentResolver(typeDirectiveName, containingFile, compilerOptions, compilerHost),
                    getCustomTransformers: () => ({ before: [], after: [] }),
                }
            }
        ]
    }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': path.join(__dirname, "../../../index.js") } }
