'use strict';

var gulp = require('gulp');
var gutil = require('gulp-util');
var webpack = require('webpack');
var WebpackNotifierPlugin = require('webpack-notifier');
var failPlugin = require('webpack-fail-plugin');
var webpackConfig = require('../webpack.config.js');
var packageJson = require('../package.json');

function buildProduction(done) {
   // modify some webpack config options
   var myProdConfig = Object.create(webpackConfig);
   myProdConfig.output.filename = '[name].[hash].js';

   myProdConfig.plugins = myProdConfig.plugins.concat(
      new webpack.DefinePlugin({
          'process.env': {
              'NODE_ENV': JSON.stringify('production')
         }
      }),
      new webpack.optimize.CommonsChunkPlugin({ name: 'vendor', filename: 'vendor.[hash].js' }),
      new webpack.optimize.DedupePlugin(),
      new webpack.optimize.UglifyJsPlugin(),
      failPlugin
   );

   // run webpack
   webpack(myProdConfig, function (err, stats) {
      if (err) { throw new gutil.PluginError('webpack:build', err); }
      gutil.log('[webpack:build]', stats.toString({
         colors: true
      }));

      if (done) { done(); }
   });
}

function createDevCompiler() {
   // modify some webpack config options
   var myDevConfig = Object.create(webpackConfig);
   myDevConfig.devtool = 'inline-source-map';
   myDevConfig.debug = true;

   myDevConfig.plugins = myDevConfig.plugins.concat(
      new webpack.optimize.CommonsChunkPlugin({ name: 'vendor', filename: 'vendor.js' }),
      new WebpackNotifierPlugin({ title: 'Webpack build', excludeWarnings: true })
   );

   // create a single instance of the compiler to allow caching
   return webpack(myDevConfig);
}

function build() {
   return new Promise(function (resolve, reject) {
      buildProduction(function (err) {
         if (err) {
            reject(err);
         } else {
            resolve('webpack built');
         }
      });
   });
}

function watch() {
   var firstBuildDone = false;

   return new Promise(function (resolve, reject) {
      var devCompiler = createDevCompiler();
      devCompiler.watch({ // watch options:
         aggregateTimeout: 300 // wait so long for more changes
      }, function (err, stats) {
         if (err) {
            if (!firstBuildDone) {
               firstBuildDone = true; 
               reject(err);
            }
            throw new gutil.PluginError('webpack:build-dev', err);
         } else {
            if (!firstBuildDone) {
               firstBuildDone = true; 
               resolve('webpack built');
            }
         }

         gutil.log('[webpack:build-dev]', stats.toString({
            chunks: false,
            colors: true
         }));
      });
   });
}

module.exports = {
   build: function () { return build(); },
   watch: function () { return watch(); }
};