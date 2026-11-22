var path = require('path');

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
            {
                test: /\.ts$/, loader: 'ts-loader', options: {
                    // 'foo' and 'baz' are only resolvable by TypeScript via this;
                    // everything else is left to the default resolution.
                    resolveModuleName: (moduleName, containingDirectory, context) => {
                        switch (moduleName) {
                            case 'foo': return context.resolveDefault(path.join(__dirname, 'foo-pkg'));
                            case 'baz': return context.resolveDefault(path.join(__dirname, 'baz-pkg'));
                        }
                    },
                }
            }
        ]
    }
}
