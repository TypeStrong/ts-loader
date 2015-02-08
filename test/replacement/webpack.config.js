var webpack = require('webpack')
var path = require('path')

module.exports = {
    context: __dirname,
    entry: './app.ts',
    output: {
        path: __dirname,
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['', '.js', '.ts']
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: path.join(__dirname, '../../index.js') + '?instance=replacement' }
        ]
    },
		plugins: [
				new webpack.NormalModuleReplacementPlugin(/a\.ts$/, './sub/a.ts')
		]
}