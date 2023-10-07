const { VueLoaderPlugin } = require("vue-loader");

module.exports = {
    mode: 'development',
    entry: './index.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    devtool: 'source-map',
    module: {
        rules: [
            { test: /\.ts$/, loader: 'ts-loader' },
            {
              test: /\.vue$/,
              loader: "vue-loader",
            },
        ]
    },
    plugins: [new VueLoaderPlugin()],
}
