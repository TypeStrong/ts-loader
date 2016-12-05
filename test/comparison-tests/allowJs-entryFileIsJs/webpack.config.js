module.exports = {
  entry: './src',
    output: {
        filename: 'bundle.js'
    },
  resolve: {
    extensions: ['', '.webpack.js', '.web.js', '.ts', '.tsx', '.js', '.jsx']
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        loader: 'ts-loader'
      }
    ]
  },
  ts: {
    entryFileIsJs: true
  }
}

// for test harness purposes only, you would not need this in a normal project
module.exports.resolveLoader = { alias: { 'ts-loader': require('path').join(__dirname, "../../index.js") } }