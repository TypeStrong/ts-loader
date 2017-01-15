module.exports = {
  entry: './src',
    output: {
        filename: 'bundle.js'
    },
  resolve: {
    extensions: ['.webpack.js', '.web.js', '.ts', '.tsx', '.js', '.jsx']
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


