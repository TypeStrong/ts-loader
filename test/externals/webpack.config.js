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
    externals: {
        hello: true,
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: '../../index.js?instance=externals' }
        ]
    }
}