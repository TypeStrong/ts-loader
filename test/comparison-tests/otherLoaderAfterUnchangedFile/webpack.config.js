// a.ts reaches ts-loader as it is on disk, then b.ts arrives changed by
// another loader: TypeScript has to see b.ts as webpack does, both when b.ts
// is compiled and when app.ts, compiled before it, is checked again.
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
          { loader: './make-b-a-string-loader.js' }
        ]
      }
    ]
  }
}
