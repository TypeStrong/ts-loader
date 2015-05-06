var path = require('path')

var tsLoaderOptions = {
	instance: 'files',
	files: [
		path.join(__dirname, "./lib/externalLib.d.ts")
	]
}

module.exports = {
    context: __dirname,
    entry: './app.ts',
    output: {
        path: __dirname,
        filename: 'bundle.js'
    },
    resolve: {
        alias: { externalLib: path.join(__dirname, "./lib/externalLib.js") },
        extensions: ['', '.js', '.ts']
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: "../../index.js?"+JSON.stringify(tsLoaderOptions) }
        ]
    }
}