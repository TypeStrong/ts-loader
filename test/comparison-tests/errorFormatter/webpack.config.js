var path = require('path');

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
                        const messageColor = error.severity === 'warning' ? colors.bold.yellow : colors.bold.red;
                        return 'Does not compute.... ' + messageColor(Object.keys(error).map(key => `${key}: ${error[key]}`));
                    }
                }
            }
        ]
    } 
}


