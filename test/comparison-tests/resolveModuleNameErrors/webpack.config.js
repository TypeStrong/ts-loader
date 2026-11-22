var path = require('path');

module.exports = {
    mode: 'development',
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    externals: { throws: 'throws', legacy: 'legacy', text: 'text' },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/, loader: 'ts-loader', options: {
                    // Each of these is a mistake that ts-loader reports by naming the option
                    resolveModuleName: (moduleName) => {
                        switch (moduleName) {
                            case 'throws': throw new Error('boom from the resolver');
                            // what a ts-loader 9 resolver returns
                            case 'legacy': return { resolvedModule: { resolvedFileName: path.join(__dirname, 'app.ts') } };
                            case 'text': return path.join(__dirname, 'app.ts');
                        }
                    },
                }
            }
        ]
    }
}
