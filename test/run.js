var assert = require("assert")
var fs = require('fs-extra');
var path = require('path');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var webpack = require('webpack');
var regexEscape = require('escape-string-regexp');

// set up new empty staging area
var stagingPath = path.resolve(__dirname, '..', '.test');
rimraf.sync(stagingPath);

// loop through each test directory
fs.readdirSync(__dirname).forEach(function(file) {
    var testPath = path.join(__dirname, file);
    if (fs.statSync(testPath).isDirectory()) {
        
        describe(file, function() {
            it('should have the correct output', function(done) {
                this.timeout(10000);
                
                // set up paths
                var testStagingPath = path.join(stagingPath, file),
                    actualOutput = path.join(testStagingPath, 'actualOutput'),
                    expectedOutput = path.join(testStagingPath, 'expectedOutput'),
                    webpackOutput = path.join(testStagingPath, '.output');
                
                // copy all input to a staging area
                mkdirp.sync(testStagingPath);
                fs.copySync(testPath, testStagingPath);
                    
                    
                // ensure actualOutput directory
                mkdirp.sync(actualOutput);
                
                // execute webpack
                var config = require(path.join(testStagingPath, 'webpack.config'));
                config.output.path = webpackOutput;
                config.context = testStagingPath;
                config.ts = { silent: true };
                
                var iteration = 0;
                var watcher = webpack(config).watch({}, function(err, stats) {
                    var patch = '';
                    if (iteration > 0) {
                        patch = 'patch'+(iteration-1);
                        actualOutput = path.join(testStagingPath, 'actualOutput', patch);
                        expectedOutput = path.join(testStagingPath, 'expectedOutput', patch);
                        mkdirp.sync(actualOutput);
                        mkdirp.sync(expectedOutput);
                    }
                    
                    // output results to actualOutput
                    if (err) {
                        fs.writeFileSync(
                            path.join(actualOutput, 'err.txt'), 
                            err.toString().replace(new RegExp(regexEscape(testStagingPath+path.sep), 'g'), ''));
                    }
                    
                    if (stats) {
                        fs.writeFileSync(
                            path.join(actualOutput, 'output.txt'), 
                            stats.toString({timings: false, version: false}).replace(new RegExp(regexEscape(testStagingPath+path.sep), 'g'), ''));
                    }
                    
                    fs.copySync(webpackOutput, actualOutput);
                    rimraf.sync(webpackOutput);
                
                    // compare actual to expected
                    var actualFiles = fs.readdirSync(actualOutput),
                        expectedFiles = fs.readdirSync(expectedOutput).filter(function(file) { return !/^patch/.test(file); });
                    
                    assert.equal(
                        actualFiles.length, 
                        expectedFiles.length, 
                        'number of files is different between actualOutput' + (patch?'/'+patch:patch) + ' and expectedOutput' + (patch?'/'+patch:patch));
                    
                    actualFiles.forEach(function(file) {
                        var actual = fs.readFileSync(path.join(actualOutput, file)).toString();
                        var expected = fs.readFileSync(path.join(expectedOutput, file)).toString();
                        
                        assert.equal(actual.toString(), expected.toString(), (patch?patch+'/':patch) + file + ' is different between actual and expected');
                    });
                    
                    // check for new files to copy in
                    var patchPath = path.join(testStagingPath, 'patch'+iteration);
                    if (fs.existsSync(patchPath)) {
                        iteration++;
                        
                        // can't use copy lib here, doesn't seem to work well with webpack's watch
                        // this way works consistently (but is more simplistic than full copy)
                        fs.readdirSync(patchPath).forEach(function(file) {
                           fs.writeFileSync(path.join(testStagingPath, file), fs.readFileSync(path.join(patchPath, file)));
                        });
                    }
                    else {
                        watcher.close(function() {
                            done();
                        });
                    }
                });
            });
        });
    }
});