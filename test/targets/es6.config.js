module.exports = {
    context: __dirname,
    entry: { 
        accessor: './accessors.ts',
        let: './let.ts'
    },
    output: {
        path: __dirname
    },
    resolve: {
        extensions: ['', '.js', '.ts']
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: '../../index.js?instance=targetES6&target=ES6' }
        ]
    }
}