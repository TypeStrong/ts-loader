const path = require('path');
const ForkTsCheckerNotifierWebpackPlugin = require('fork-ts-checker-notifier-webpack-plugin');
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
        main
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        publicPath: "/"
    },
    plugins: [
        new ForkTsCheckerWebpackPlugin({
            tslint: true, 
            useTypescriptIncrementalApi: false, // not possible to use this until: https://github.com/microsoft/TypeScript/issues/31056
            resolveModuleNameModule: process.versions.pnp
                ? `${__dirname}/pnpTs.js`
                : undefined,
            resolveTypeReferenceDirectiveModule: process.versions.pnp
                ? `${__dirname}/pnpTs.js`
                : undefined
        }),
        new ForkTsCheckerNotifierWebpackPlugin({ title: 'TypeScript', excludeWarnings: false }),
        new HtmlWebpackPlugin({
            inject: true,
            template: 'src/index.html'
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
    },
    devtool: 'inline-source-map',
    devServer: {
        clientLogLevel: 'warning',
        open: true,
        historyApiFallback: true,
        stats: 'errors-only'
    }
};
