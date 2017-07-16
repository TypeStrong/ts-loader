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
  webpack.build(done);
});

gulp.task('build-other', ['delete-dist'], function() {
  staticFiles.build();
});

gulp.task('build', ['build-js', 'build-other'], function () {
  inject.build();
});

gulp.task('watch-js', ['delete-dist'], function (done) {
  webpack.watch(done)
});

gulp.task('watch', ['watch-js'], function() {
  inject.watch();
  staticFiles.watch();
  tests.watch();
});

gulp.task('serve', ['watch'], function() {
  // local as not required for build
  var express = require('express')
  var app = express()

  app.use(express.static('dist', {'index': 'index.html'}))
  app.listen(8080);
});
