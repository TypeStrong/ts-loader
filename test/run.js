var assert = require("assert")
var fs = require('fs-extra');
var path = require('path');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var webpack = require('webpack');
var webpackVersion = require('webpack/package.json').version;
var regexEscape = require('escape-string-regexp');
var typescript = require('typescript');
var semver = require('semver');
var glob = require('glob');

// force colors on for tests since expected output has colors
require('colors').enabled = true;

var saveOutputMode = process.argv.indexOf('--save-output') !== -1;
var excludeVersions = process.argv.indexOf('--exclude-versions') !== -1;

var indexOfSingleTest = process.argv.indexOf('--single-test');
var singleTestToRun = indexOfSingleTest !== -1 && process.argv[indexOfSingleTest + 1];

var savedOutputs = {};

if (!excludeVersions) {
    console.log('Using webpack version ' + webpackVersion);
    console.log('Using typescript version ' + typescript.version);
}

if (saveOutputMode) {
    console.log('Will save output as --save-output was supplied...');
}

var typescriptVersion = semver.major(typescript.version) + '.' + semver.minor(typescript.version);
var FLAKY = '_FLAKY_';

// set up new empty staging area
var rootPath = path.resolve(__dirname, '..');
var rootPathWithIncorrectWindowsSeparator = rootPath.replace(/\\/g, '/');
var stagingPath = path.resolve(rootPath, '.test');
rimraf.sync(stagingPath);

// loop through each test directory
var test = singleTestToRun;
var testPath = path.join(__dirname, test);
if (fs.statSync(testPath).isDirectory()) {

    if (test == 'testLib') return;

    if (test == 'issue81' && semver.lt(typescript.version, '1.7.0-0')) return;

    describe(test, function () {
        it('should have the correct output', createTest(test, testPath, {}));

        if (test == 'declarationOutput') { return; }
        if (test == 'declarationWatch') { return; }
        if (test == 'issue71') { return; }
        it('should work with transpile', createTest(test, testPath, { transpile: true }));
    });
}

function createTest(test, testPath, options) {
    return function (done) {
        this.timeout(60000); // sometimes it just takes awhile

        // set up paths
        var testStagingPath = path.join(stagingPath, test + (options.transpile ? '.transpile' : '')),
            actualOutput = path.join(testStagingPath, 'actualOutput'),
            expectedOutput = path.join(testStagingPath, 'expectedOutput-' + typescriptVersion),
            webpackOutput = path.join(testStagingPath, '.output'),
            originalExpectedOutput = path.join(testPath, 'expectedOutput-' + typescriptVersion);

        if (saveOutputMode) {
            savedOutputs[test] = savedOutputs[test] || {};
            var regularSavedOutput = savedOutputs[test].regular = savedOutputs[test].regular || {};
            var transpiledSavedOutput = savedOutputs[test].transpiled = savedOutputs[test].transpiled || {};
            var currentSavedOutput = options.transpile ? transpiledSavedOutput : regularSavedOutput;
            mkdirp.sync(originalExpectedOutput);
        } else {
            assert.ok(pathExists(originalExpectedOutput), 'The expected output does not exist; there is nothing to compare against! Has the expected output been created?\nCould not find: ' + originalExpectedOutput)
        }

        // copy all input to a staging area
        mkdirp.sync(testStagingPath);
        fs.copySync(testPath, testStagingPath);


        // ensure output directories
        mkdirp.sync(actualOutput);
        mkdirp.sync(webpackOutput);

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
        var lastHash;
        var watcher = webpack(config).watch({ aggregateTimeout: 1500 }, function (err, stats) {
            var patch = '';
            if (iteration > 0) {
                patch = 'patch' + (iteration - 1);
                actualOutput = path.join(testStagingPath, 'actualOutput', patch);
                expectedOutput = path.join(testStagingPath, 'expectedOutput-' + typescriptVersion, patch);
                originalExpectedOutput = path.join(testPath, 'expectedOutput-' + typescriptVersion, patch)
                mkdirp.sync(actualOutput);
                mkdirp.sync(expectedOutput);
                if (saveOutputMode) mkdirp.sync(originalExpectedOutput);
            }

            // replace the hash if found in the output since it can change depending
            // on environments and we're not super interested in it
            if (stats) {
                glob.sync('**/*', { cwd: webpackOutput, nodir: true }).forEach(function (file) {
                    var content = fs.readFileSync(path.join(webpackOutput, file), 'utf-8');
                    content = content.split(stats.hash).join('[hash]');
                    fs.writeFileSync(path.join(webpackOutput, file), content);
                });
            }

            // output results
            if (saveOutputMode) {
                // loop through webpackOutput and rename to .transpiled if needed
                glob.sync('**/*', { cwd: webpackOutput, nodir: true }).forEach(function (file) {
                    var patchedFileName = patch + '/' + file;
                    currentSavedOutput[patchedFileName] = fs.readFileSync(path.join(webpackOutput, file), 'utf-8');

                    if (options.transpile) {
                        if (regularSavedOutput[patchedFileName] !== transpiledSavedOutput[patchedFileName]) {
                            var extension = path.extname(file);
                            fs.renameSync(
                                path.join(webpackOutput, file),
                                path.join(webpackOutput, path.basename(file, extension) + '.transpiled' + extension)
                            );
                        }
                    }
                });

                fs.copySync(webpackOutput, originalExpectedOutput, { clobber: true });
            }
            fs.copySync(webpackOutput, actualOutput);
            rimraf.sync(webpackOutput);

            if (err) {
                var errFileName = 'err.txt';

                var errString = err.toString()
                    .replace(new RegExp(regexEscape(testStagingPath + path.sep), 'g'), '')
                    .replace(new RegExp(regexEscape(rootPath + path.sep), 'g'), '')
                    .replace(new RegExp(regexEscape(rootPath), 'g'), '')
                    .replace(/\.transpile/g, '');

                fs.writeFileSync(path.join(actualOutput, errFileName), errString);
                if (saveOutputMode) {
                    var patchedErrFileName = patch + '/' + errFileName;
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

            if (stats && stats.hash != lastHash) {
                lastHash = stats.hash;

                var statsFileName = 'output.txt';

                // do a little magic to normalize `\` to `/` for asset output
                var newAssets = {};
                Object.keys(stats.compilation.assets).forEach(function (asset) {
                    newAssets[asset.replace(/\\/g, "/")] = stats.compilation.assets[asset];
                });
                stats.compilation.assets = newAssets;

                var statsString = stats.toString({ timings: false, version: false, hash: false })
                    .replace(new RegExp(regexEscape(testStagingPath + path.sep), 'g'), '')
                    .replace(new RegExp(regexEscape(rootPath + path.sep), 'g'), '')
                    .replace(new RegExp(regexEscape(rootPath), 'g'), '')
                    .replace(new RegExp(regexEscape(rootPathWithIncorrectWindowsSeparator), 'g'), '')
                    .replace(/\.transpile/g, '');

                fs.writeFileSync(path.join(actualOutput, statsFileName), statsString);
                if (saveOutputMode) {
                    var patchedStatsFileName = patch + '/' + statsFileName;
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

            if (!saveOutputMode) {
                // massage any .transpiled. files
                glob.sync('**/*', { cwd: expectedOutput, nodir: true }).forEach(function (file) {
                    if (/\.transpiled/.test(file)) {
                        if (options.transpile) { // rename if we're in transpile mode
                            var extension = path.extname(file);
                            fs.renameSync(
                                path.join(expectedOutput, file),
                                path.join(expectedOutput, path.dirname(file), path.basename(file, '.transpiled' + extension) + extension)
                            );
                        }
                        else { // otherwise delete
                            fs.unlinkSync(path.join(expectedOutput, file));
                        }

                    }
                });

                // compare actual to expected
                var actualFiles = glob.sync('**/*', { cwd: actualOutput, nodir: true }),
                    expectedFiles = glob.sync('**/*', { cwd: expectedOutput, nodir: true })
                        .filter(function (file) { return !/^patch/.test(file); }),
                    allFiles = {};

                actualFiles.map(function (file) { allFiles[file] = true });
                expectedFiles.map(function (file) { allFiles[file] = true });

                Object.keys(allFiles).forEach(function (file) {
                    var actual = getNormalisedFileContent(file, actualOutput, test);
                    var expected = getNormalisedFileContent(file, expectedOutput, test);

                    compareActualAndExpected(test, actual, expected, patch, file);
                });
            }

            // check for new files to copy in
            var patchPath = path.join(testStagingPath, 'patch' + iteration);
            if (fs.existsSync(patchPath)) {
                iteration++;

                // can get inconsistent results if copying right away
                setTimeout(function () {
                    fs.copySync(patchPath, testStagingPath, { clobber: true });
                }, 1000);
            }
            else {
                watcher.close(function () {
                    done();
                });
            }
        });
    };
}

function pathExists(path) {
    var pathExists = true;
    try {
        fs.accessSync(path, fs.F_OK);
    } catch (e) {
        pathExists = false;
    }
    return pathExists;
}

function getNormalisedFileContent(file, location, test) {
    var fileContent;
    var filePath = path.join(location, file);
    try {
        fileContent = fs.readFileSync(filePath).toString().replace(/\r\n/g, '\n');

        // Strip ' [built]' references from output*.txt files; seems to be used unpredictably 
        // and doesn't appear to be relevant so safe to ignore
        if (file.indexOf('output.') === 0) {
            fileContent = fileContent.replace(new RegExp(regexEscape(' [built]'), 'g'), '');

            // Convert '/' to '\' and back to '/' so slashes are treated the same
            // whether running / generated on windows or *nix
            fileContent = fileContent
                .replace(new RegExp(regexEscape('/'), 'g'), '\\')
                .replace(new RegExp(regexEscape('\\'), 'g'), '/');

            // ignore flaky in the output.txt paths
            if (testIsFlaky(test)) {
                fileContent = fileContent.replace(new RegExp(regexEscape(FLAKY), 'g'), '');
            }
        }
    }
    catch (e) {
        fileContent = '!!!' + filePath + ' doesnt exist!!!';
    }
    return fileContent;
}

/**
 * If a test is marked as flaky then don't fail the build if it doesn't pass
 * Instead, report the differences and carry on
 */
function compareActualAndExpected(test, actual, expected, patch, file) {
    if (testIsFlaky(test)) {
        try {
            assert.equal(actual.toString(), expected.toString(), (patch ? patch + '/' : patch) + file + ' is different between actual and expected');
        }
        catch (e) {
            console.log("Flaky test error!\n");
            console.log("MESSAGE:\n" + e.message, '\n');
            console.log('EXPECTED:\n', e.expected, '\n');
            console.log("ACTUAL:\n", e.actual, '\n');
        }
    }
    else {
        assert.equal(actual.toString(), expected.toString(), (patch ? patch + '/' : patch) + file + ' is different between actual and expected');
    }
}

function testIsFlaky(testName) {
    return testName.indexOf(FLAKY) === 0;
}