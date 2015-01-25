module.exports = {
    context: __dirname,
    entry: './a.ts',
    output: {
        path: __dirname
    },
    resolve: {
        extensions: ['', '.js', '.ts']
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: '../../index.js?instance=moduleAMD&module=AMD' }
        ]
    }
}