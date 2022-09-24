const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
// To improve build times for large projects enable fork-ts-checker-webpack-plugin
// const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
  "mode": "development",
  "entry": "src/index.tsx",
  "output": {
      "path": __dirname+'/dist',
      "filename": "[name].js"
  },
  "watch": false,
  "context": __dirname, // to automatically find tsconfig.json
  "module": {
      "rules": [
          {
              "test": /\.([cm]?ts|tsx)$/,
              "exclude": /node_modules/,
              "use": {
                  "loader": "ts-loader",
                  "options": {
                      "projectReferences": true
                  }
              }
          }
      ]
  },
  resolve: {
    modules: [
      "node_modules",
      path.resolve(__dirname)
    ],
    // TsconfigPathsPlugin will automatically add this
    // alias: {
    //   packages: path.resolve(__dirname, 'packages/'),
    // },
    extensions: [".js", ".ts", ".tsx"],
    extensionAlias: {
      ".js": [".js", ".ts"],
      ".cjs": [".cjs", ".cts"],
      ".mjs": [".mjs", ".mts"]
    },
    plugins: [
      new TsconfigPathsPlugin({
        logLevel: "info",
        mainFields: "module",
        extensions: [".js", ".ts", ".tsx"]
      })
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      templateContent: `
        <html>
          <body>
            <h1>Project Reference Demo App</h1>
            <div id='react-content'></div>
          </body>
        </html>
      `
    }),
    // new ForkTsCheckerWebpackPlugin()
  ]
}
