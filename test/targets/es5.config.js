module.exports = {
    context: __dirname,
    entry: { 
        accessor: './accessors.ts',
        let: './let.ts'
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
            { test: /\.ts$/, loader: '../../index.js?instance=targetES5&target=ES5' }
        ]
    }
}