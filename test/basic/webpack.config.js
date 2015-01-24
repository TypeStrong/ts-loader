module.exports = {
    context: __dirname,
    entry: './app.ts',
    output: {
        path: __dirname
    },
    resolve: {
        alias: { externalLib: "./lib/externalLib.js" },
        extensions: ['', '.js', '.ts']
    },
    resolveLoader: {
        alias: { ts: "../../index.js" }
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: 'ts' }
        ]
    }
}