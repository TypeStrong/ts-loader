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
                    // the default instance name is a hash of the options, and these hold absolute paths
                    instance: 'contextWatch',
                    // the config's "include": ["src"] means ./src here, not tsconfig-container/src
                    context: __dirname,
                    configFile: path.resolve(__dirname, 'tsconfig-container/tsconfig.json')
                }
            }
        ]
    }
}
