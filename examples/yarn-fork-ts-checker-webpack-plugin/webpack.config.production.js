const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const PnpWebpackPlugin = require('pnp-webpack-plugin');

const main = [
    'core-js',
    'whatwg-fetch',
    './src/index.tsx'
];

module.exports = {
    context: process.cwd(), // to automatically find tsconfig.json
    entry: {
        main: main
    },
    output: {
        path: path.join(process.cwd(), 'dist'),
        filename: '[name].js',
    },
    plugins: [
        new ForkTsCheckerWebpackPlugin(PnpWebpackPlugin.forkTsCheckerOptions({
            async: false,
            useTypescriptIncrementalApi: false, // not possible to use this until: https://github.com/microsoft/TypeScript/issues/31056
            memoryLimit: 4096
        })),
        new HtmlWebpackPlugin({
            hash: true,
            inject: true,
            template: 'src/index.html',
            minify: {
                removeComments: true,
                collapseWhitespace: true,
                removeRedundantAttributes: true,
                useShortDoctype: true,
                removeEmptyAttributes: true,
                removeStyleLinkTypeAttributes: true,
                keepClosingSlash: true,
                minifyJS: true,
                minifyCSS: true,
                minifyURLs: true,
            },
        }),
    ],
    module: {
        rules: [
            {
                test: /.tsx?$/,
                loader: require.resolve("ts-loader"),
                options: PnpWebpackPlugin.tsLoaderOptions({ transpileOnly: true })
            }
        ]
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js"],
      plugins: [PnpWebpackPlugin]
    },
    resolveLoader: {
      plugins: [PnpWebpackPlugin.moduleLoader(module)]
    }
};
