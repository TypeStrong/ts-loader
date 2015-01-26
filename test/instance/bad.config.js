module.exports = {
    context: __dirname,
    entry: { 
        a: './a.ts',
        b: './b.ts'
    },
    output: {
        path: __dirname,
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['', '.js', '.ts']
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: '../../index.js?instance=instanceBad' }
        ]
    }
}