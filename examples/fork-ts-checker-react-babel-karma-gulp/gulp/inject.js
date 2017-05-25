'use strict';

var gulp = require('gulp');
var inject = require('gulp-inject');
var glob = require('glob');

function injectIndex(options) {
  function run() {
    var target = gulp.src('./src/index.html');
    var sources = gulp.src([
      //'./dist/styles/main*.css',
      './dist/scripts/vendor*.js',
      './dist/scripts/main*.js'
    ], { read: false });

    return target
      .pipe(inject(sources, { ignorePath: '/dist/', addRootSlash: false, removeTags: true }))
      .pipe(gulp.dest('./dist'));
  }

  var jsCssGlob = 'dist/**/*.{js,css}';

  function checkForInitialFilesThenRun() {
    glob(jsCssGlob, function (er, files) {
      var filesWeNeed = ['dist/scripts/main', 'dist/scripts/vendor'/*, 'dist/styles/main'*/];

      function fileIsPresent(fileWeNeed) {
        return files.some(function(file) {
          return file.indexOf(fileWeNeed) !== -1;
        });
      }

      if (filesWeNeed.every(fileIsPresent)) {
        run('initial build');
      } else {
        checkForInitialFilesThenRun();
      }
    });
  }

  checkForInitialFilesThenRun();

  if (options.shouldWatch) {
    gulp.watch(jsCssGlob, function(evt) {
      if (evt.path && evt.type === 'changed') {
        run(evt.path);
      }
    });
  }
}

module.exports = {
  build: function() { return injectIndex({ shouldWatch: false }); },
  watch: function() { return injectIndex({ shouldWatch: true  }); }
};
