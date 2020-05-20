module.exports = {
  mode: 'development',
  entry: './app.ts',
  output: {
    filename: 'bundle.js'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          { loader: 'ts-loader' },
          { loader: './remove-bug-loader.js' }
        ]
      }
    ]
  }
}
