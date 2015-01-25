module.exports = {
    context: __dirname,
    entry: './a.ts',
    output: {
        path: __dirname
    },
    resolve: {
        extensions: ['', '.js', '.ts']
    },
    devtool: 'source-map',
    module: {
        loaders: [
            { test: /\.ts$/, loader: '../../index.js?instance=sourceMapsOn&sourceMap' }
        ]
    }
}