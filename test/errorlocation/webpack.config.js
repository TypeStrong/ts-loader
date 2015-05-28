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
    module: {
        loaders: [
            { test: /\.ts$/, loader: '../../index.js?instance=errorlocation' }
        ]
    }
}