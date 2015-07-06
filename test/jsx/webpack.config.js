module.exports = {
    context: __dirname,
    entry: './app.tsx',
    output: {
        path: __dirname,
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['', '.tsx', '.ts', '.js']
    },
    externals: {
        react: true,
    },
    module: {
        loaders: [
            { test: /\.ts(x?)$/, loader: '../../index.js?instance=jsx&compiler=ntypescript' }
        ]
    }
}