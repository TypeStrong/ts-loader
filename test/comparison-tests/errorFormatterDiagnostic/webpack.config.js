var os = require('os');
var path = require('path');
var ts = require('typescript');

module.exports = {
    mode: 'development',
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        alias: {
            components: path.resolve(__dirname, 'common/components')
        },
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/, loader: 'ts-loader', options: {
                    errorFormatter: function customErrorFormatter(error, colors) {
                        return ts.formatDiagnosticsWithColorAndContext([error.diagnostic], {
                            getCurrentDirectory: () => __dirname,
                            getCanonicalFileName: (fileName) => path.normalize(fileName),
                            getNewLine: () => os.EOL,
                        });
                    }
                }
            }
        ]
    }
}
