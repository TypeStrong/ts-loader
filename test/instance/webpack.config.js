module.exports = {
    context: __dirname,
    entry: { 
        a: './a.ts',
        b: './b.ts'
    },
    output: {
        path: __dirname
    },
    resolve: {
        extensions: ['', '.js', '.ts']
    },
    resolveLoader: {
        alias: { ts: "../../index.js" }
    },
    module: {
        loaders: [
            // this will fail if both files are passed through the same instance
            { test: /\a.ts$/, loader: 'ts' }, // instance=default
            { test: /\b.ts$/, loader: 'ts?instance=different' }
        ]
    }
}