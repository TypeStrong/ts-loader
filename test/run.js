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

var saveOutputMode = process.argv.indexOf('--save-output') != -1;

var savedOutputs = {};

console.log('Using webpack version ' + webpackVersion);
console.log('Using typescript version ' + typescript.version);

// set up new empty staging area
var rootPath = path.resolve(__dirname, '..');
var stagingPath = path.resolve(rootPath, '.test');
rimraf.sync(stagingPath);

// loop through each test directory
fs.readdirSync(__dirname).forEach(function(test) {
    var testPath = path.join(__dirname, test);
    if (fs.statSync(testPath).isDirectory()) {
        
        if (test == 'aliasResolution' && semver.lt(typescript.version, '1.6.0-0')) return;
        if (test == 'jsx' && semver.lt(typescript.version, '1.6.0-0')) return;
        if (test == 'jsxPreserve' && semver.lt(typescript.version, '1.6.0-0')) return;
        if (test == 'es6codeSplitting' && semver.lt(typescript.version, '1.6.0-0')) return;
        if (test == 'nodeResolution' && semver.lt(typescript.version, '1.6.0-0')) return;
        
        describe(test, function() {
            it('should have the correct output', createTest(test, testPath, {}));
            
            if (test == 'declarationOutput') { return; }
            if (test == 'declarationWatch') { return; }
            if (test == 'sourceMaps' && semver.lt(typescript.version, '1.6.0-0')) return;
            it('should work with transpile', createTest(test, testPath, {transpile: true}));
        });
    }
});

function createTest(test, testPath, options) {
    return function(done) {
        this.timeout(30000); // sometimes it just takes awhile
        
        // set up paths
        var testStagingPath = path.join(stagingPath, test+(options.transpile ? '.transpile' : '')),
            actualOutput = path.join(testStagingPath, 'actualOutput'),
            expectedOutput = path.join(testStagingPath, 'expectedOutput'),
            webpackOutput = path.join(testStagingPath, '.output'),
            originalExpectedOutput = path.join(testPath, 'expectedOutput');
        
        if (saveOutputMode) {
            savedOutputs[test] = savedOutputs[test] || {};
            var regularSavedOutput = savedOutputs[test].regular = savedOutputs[test].regular || {};
            var transpiledSavedOutput = savedOutputs[test].transpiled = savedOutputs[test].transpiled || {};
            var currentSavedOutput = options.transpile ? transpiledSavedOutput : regularSavedOutput;
            mkdirp.sync(originalExpectedOutput);
        }
        
        // copy all input to a staging area
        mkdirp.sync(testStagingPath);
        fs.copySync(testPath, testStagingPath);
           
            
        // ensure actualOutput directory
        mkdirp.sync(actualOutput);
        
        // execute webpack
        var config = require(path.join(testStagingPath, 'webpack.config'));
        config.output.path = webpackOutput;
        config.context = testStagingPath;
        config.resolveLoader = config.resolveLoader || {};
        config.resolveLoader.alias = config.resolveLoader.alias || {};
        config.resolveLoader.alias.newLine = path.join(__dirname, 'newline.loader.js');
        config.module.loaders.push({ test: /\.js$/, loader: 'newLine' });
        config.ts = config.ts || {};
        config.ts.silent = true;
        config.ts.compilerOptions = {
            newLine: 'LF'
        }
        
        if (options.transpile) config.ts.transpileOnly = true;
        
        var iteration = 0;
        var watcher = webpack(config).watch({}, function(err, stats) {
            var patch = '';
            if (iteration > 0) {
                patch = 'patch'+(iteration-1);
                actualOutput = path.join(testStagingPath, 'actualOutput', patch);
                expectedOutput = path.join(testStagingPath, 'expectedOutput', patch);
                originalExpectedOutput = path.join(testPath, 'expectedOutput', patch)
                mkdirp.sync(actualOutput);
                mkdirp.sync(expectedOutput);
                if (saveOutputMode) mkdirp.sync(originalExpectedOutput);
            }
            
            // output results to actualOutput
            if (err) {
                //var errFileName = 'err' + (options.transpile?'.transpiled':'') + '.txt';
                var errFileName = 'err.txt';
                
                var errString = err.toString()
                    .replace(new RegExp(regexEscape(testStagingPath+path.sep), 'g'), '')
                    .replace(new RegExp(regexEscape(rootPath+path.sep), 'g'), '')
                    .replace(new RegExp(regexEscape(rootPath), 'g'), '')
                    .replace(/\.transpile/g, '');
                
                fs.writeFileSync(path.join(actualOutput, errFileName), errString);
                if (saveOutputMode) {
                    var patchedErrFileName = patch+'/'+errFileName;
                    currentSavedOutput[patchedErrFileName] = errString;
                    
                    if (options.transpile) {
                        if (regularSavedOutput[patchedErrFileName] !== transpiledSavedOutput[patchedErrFileName]) {
                            fs.writeFileSync(path.join(originalExpectedOutput, 'err.transpiled.txt'), errString);
                        }
                    }
                    else {
                        fs.writeFileSync(path.join(originalExpectedOutput, errFileName), errString);
                    }
                }
            }
            
            if (stats) {
                var statsFileName = 'output.txt';
                
                var statsString = stats.toString({timings: false, version: false, hash: false})
                    .replace(new RegExp(regexEscape(testStagingPath+path.sep), 'g'), '')
                    .replace(new RegExp(regexEscape(rootPath+path.sep), 'g'), '')
                    .replace(new RegExp(regexEscape(rootPath), 'g'), '')
                    .replace(/\.transpile/g, '');
                
                fs.writeFileSync(path.join(actualOutput, statsFileName), statsString);
                if (saveOutputMode) {
                    var patchedStatsFileName = patch+'/'+statsFileName;
                    currentSavedOutput[patchedStatsFileName] = statsString;
                    
                    if (options.transpile) {
                        if (regularSavedOutput[patchedStatsFileName] !== transpiledSavedOutput[patchedStatsFileName]) {
                            fs.writeFileSync(path.join(originalExpectedOutput, 'output.transpiled.txt'), statsString);
                        }
                    }
                    else {
                        fs.writeFileSync(path.join(originalExpectedOutput, statsFileName), statsString);
                    }
                }
            }
            
            fs.copySync(webpackOutput, actualOutput);
            if (saveOutputMode) {
                fs.copySync(webpackOutput, originalExpectedOutput, { clobber: true });
            }
            rimraf.sync(webpackOutput);
        
            if (!saveOutputMode) {
                // massage any .transpiled.txt files
                fs.readdirSync(expectedOutput).forEach(function(file) {
                    if (/\.transpiled\.txt$/.test(file)) {
                        if (options.transpile) { // rename if we're in transpile mode
                            fs.renameSync(
                                path.join(expectedOutput, file), 
                                path.join(expectedOutput, path.basename(file, '.transpiled.txt')+'.txt')
                            );
                        }
                        else { // otherwise delete
                            fs.unlinkSync(path.join(expectedOutput, file));
                        }

                    }
                });
                
                // compare actual to expected
                var actualFiles = fs.readdirSync(actualOutput),
                    expectedFiles = fs.readdirSync(expectedOutput)
                        .filter(function(file) { return !/^patch/.test(file); });
                
                assert.equal(
                    actualFiles.length, 
                    expectedFiles.length, 
                    'number of files is different between actualOutput' + (patch?'/'+patch:patch) + ' and expectedOutput' + (patch?'/'+patch:patch));
                
                actualFiles.forEach(function(file) {
                    var actual = fs.readFileSync(path.join(actualOutput, file)).toString().replace(/\r\n/g, '\n');
                    var expected = fs.readFileSync(path.join(expectedOutput, file)).toString().replace(/\r\n/g, '\n');
                    
                    assert.equal(actual.toString(), expected.toString(), (patch?patch+'/':patch) + file + ' is different between actual and expected');
                });
            }
            
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
    };
}