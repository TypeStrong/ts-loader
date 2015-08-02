var assert = require("assert")
var fs = require('fs-extra');
var path = require('path');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var webpack = require('webpack');
var webpackVersion = require('webpack/package.json').version;
var regexEscape = require('escape-string-regexp');
var typescript = require('typescript');
var semver = require('semver')

console.log('Using webpack version ' + webpackVersion);
console.log('Using typescript version ' + typescript.version);

// set up new empty staging area
var rootPath = path.resolve(__dirname, '..');
var stagingPath = path.resolve(rootPath, '.test');
rimraf.sync(stagingPath);

// loop through each test directory
fs.readdirSync(__dirname).forEach(function(file) {
    var testPath = path.join(__dirname, file);
    if (fs.statSync(testPath).isDirectory()) {
        
        if (file == 'jsx' && semver.lt(typescript.version, '1.6.0-0')) return;
        if (file == 'jsxPreserve' && semver.lt(typescript.version, '1.6.0-0')) return;
        
        describe(file, function() {
            it('should have the correct output', function(done) {
                this.timeout(30000); // sometimes it just takes awhile
                
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
                            err.toString()
                                .replace(new RegExp(regexEscape(testStagingPath+path.sep), 'g'), '')
                                .replace(new RegExp(regexEscape(rootPath+path.sep), 'g'), '')
                        );
                    }
                    
                    if (stats) {
                        fs.writeFileSync(
                            path.join(actualOutput, 'output.txt'), 
                            stats.toString({timings: false, version: false, hash: false})
                                .replace(new RegExp(regexEscape(testStagingPath+path.sep), 'g'), '')
                                .replace(new RegExp(regexEscape(rootPath+path.sep), 'g'), '')
                        );
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
                        
                        // can get inconsistent results if copying right away
                        setTimeout(function() {
                            fs.copySync(patchPath, testStagingPath, {clobber: true});
                        }, 300);
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