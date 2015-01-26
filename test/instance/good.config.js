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
            // this will fail if both files are passed through the same instance
            { test: /a\.ts$/, loader: '../../index.js?instance=instanceGood' },
            { test: /b\.ts$/, loader: '../../index.js?instance=instanceGoodDifferent' }
        ]
    }
}