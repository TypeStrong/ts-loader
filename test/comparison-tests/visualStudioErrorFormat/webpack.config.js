var path = require('path');

module.exports = {
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
                    visualStudioErrorFormat: true
                }
            }
        ]
    } 
}


