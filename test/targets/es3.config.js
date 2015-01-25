module.exports = {
    context: __dirname,
    entry: './accessors.ts',
    output: {
        path: __dirname
    },
    resolve: {
        extensions: ['', '.js', '.ts']
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: '../../index.js?instance=targetES3&target=ES3' }
        ]
    }
}