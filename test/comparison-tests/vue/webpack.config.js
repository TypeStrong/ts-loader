module.exports = {
    entry: './index.vue',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['', '.ts', '.vue']
    },
    module: {
        loaders: [
            { test: /\.vue$/, loader: 'vue' },
            { test: /\.ts$/, loader: 'ts-loader' }
        ]
    },
    vue: {
      loaders: {
        js: 'ts-loader'
      }
    },
    ts: {
      appendTsSuffixTo: [/\.vue$/]
    }
}



