'use strict';

var gulp = require('gulp');
var gutil = require('gulp-util');
var webpack = require('./gulp/webpack');
var staticFiles = require('./gulp/staticFiles');
var tests = require('./gulp/tests');
var clean = require('./gulp/clean');
var inject = require('./gulp/inject');

gulp.task('delete-dist', function (done) {
  clean.run(done);
});

gulp.task('build-js', ['delete-dist'], function(done) {
  webpack.build().then(function() { done(); });
});

gulp.task('build-other', ['delete-dist'], function() {
  staticFiles.build();
});

gulp.task('build', ['build-js', 'build-other'], function () {
  inject.build();
});

gulp.task('watch', ['delete-dist'], function(done) {
  Promise.all([
    webpack.watch()
  ]).then(function() {
    gutil.log('Now that initial assets (js and css) are generated inject will start...');
    inject.watch();
    done();
  }).catch(function(error) {
    gutil.log('Problem generating initial assets (js and css)', error);
  });

  staticFiles.watch();
  tests.watch();
});

gulp.task('watch-and-serve', ['watch'], function() {
  // local as not required for build
  var express = require('express')
  var app = express()

  app.use(express.static('dist', {'index': 'index.html'}))
  app.listen(8080);
});
