/** @type {import("webpack").Configuration} */
module.exports = {
    mode: 'development',
    entry: './src/app.ts',
    output: {
        filename: 'bundle.js'
    },
    module: {
        rules: [
            { test: /\.[cm]?ts$/, loader: 'ts-loader' }
        ]
    },
    externals: {
      assert: 'commonjs assert'
    }
}
