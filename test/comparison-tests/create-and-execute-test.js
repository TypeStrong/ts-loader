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
var pathExists = require('../pathExists');
var aliasLoader = require('../aliasLoader');

var saveOutputMode = process.argv.indexOf('--save-output') !== -1;

var indexOfTestToRun = process.argv.indexOf('--test-to-run');
var testToRun = process.argv[indexOfTestToRun + 1];

var savedOutputs = {};

if (saveOutputMode) {
    console.log('Will save output as --save-output was supplied...');
}

var typescriptVersion = semver.major(typescript.version) + '.' + semver.minor(typescript.version);
var FLAKY = '_FLAKY_';
var IGNORE = '_IGNORE_';

// set up new paths
var rootPath = path.resolve(__dirname, '../../');
var rootPathWithIncorrectWindowsSeparator = rootPath.replace(/\\/g, '/');
var stagingPath = path.resolve(rootPath, '.test');

var testPath = path.join(__dirname, testToRun);
var testIsFlaky = pathExists(path.join(testPath, FLAKY));
var testIsIgnored = pathExists(path.join(testPath, IGNORE));

if (testIsIgnored) {
    console.log(testPath + ' is ignored... Not running test.');
}

if (fs.statSync(testPath).isDirectory() &&
    testToRun !== 'testLib' &&
    !testIsIgnored) {

    describe(testToRun, function () {
        it('should have the correct output', createTest(testToRun, testPath, {}));

        if (testToRun === 'declarationOutput' ||
            testToRun === 'importsWatch' ||
            testToRun === 'declarationWatch' ||
            testToRun === 'issue71' ||
            testToRun === 'appendSuffixToWatch') { return; }

        it('should work with transpile', createTest(testToRun, testPath, { transpile: true }));
    });
}

function createTest(test, testPath, options) {
    return function (done) {
        this.timeout(60000); // sometimes it just takes awhile

        var testState = createTestState();
        var paths = createPaths(stagingPath, test, options);
        var outputs = createOutputs();

        storeSavedOutputs(saveOutputMode, outputs, test, options, paths);

        // copy all input to a staging area
        mkdirp.sync(paths.testStagingPath);
        fs.copySync(testPath, paths.testStagingPath);

        // ensure output directories
        mkdirp.sync(paths.actualOutput);
        mkdirp.sync(paths.webpackOutput);

        // execute webpack
        testState.watcher = webpack(
            createWebpackConfig(paths, options.transpile)
        ).watch({ aggregateTimeout: 1500 }, createWebpackWatchHandler(done, paths, testState, outputs, options, test));
    };
}

function createTestState() {
    return {
        doneHasBeenCalled: false,
        iteration: 0,
        lastHash: undefined,
        watcher: undefined
    };
}

function createPaths(stagingPath, test, options) {
    var testStagingPath = path.join(stagingPath, test + (options.transpile ? '.transpile' : ''));
    return {
        testStagingPath: testStagingPath,
        actualOutput: path.join(testStagingPath, 'actualOutput'),
        expectedOutput: path.join(testStagingPath, 'expectedOutput-' + typescriptVersion),
        webpackOutput: path.join(testStagingPath, '.output'),
        originalExpectedOutput: path.join(testPath, 'expectedOutput-' + typescriptVersion)
    };
}

function createOutputs() {
    return {
        regularSavedOutput: undefined,
        transpiledSavedOutput: undefined,
        currentSavedOutput: undefined
    };
}

function storeSavedOutputs(saveOutputMode, outputs, test, options, paths) {
    if (saveOutputMode) {
        savedOutputs[test] = savedOutputs[test] || {};

        outputs.regularSavedOutput = savedOutputs[test].regular = savedOutputs[test].regular || {};
        outputs.transpiledSavedOutput = savedOutputs[test].transpiled = savedOutputs[test].transpiled || {};
        outputs.currentSavedOutput = options.transpile ? outputs.transpiledSavedOutput : outputs.regularSavedOutput;

        mkdirp.sync(paths.originalExpectedOutput);
    } else {
        assert.ok(pathExists(paths.originalExpectedOutput), 'The expected output does not exist; there is nothing to compare against! Has the expected output been created?\nCould not find: ' + paths.originalExpectedOutput)
    }
}

function createWebpackConfig(paths, transpile) {
    var config = require(path.join(paths.testStagingPath, 'webpack.config'));

    var options = {
        silent: true,
        compilerOptions: {
            newLine: 'LF'
        }
    }

    if (transpile) { options.transpileOnly = true; }

    var tsLoaderPath = require('path').join(__dirname, "../../index.js");

    aliasLoader(config, tsLoaderPath, options);

    delete config.ts;

    config.output.path = paths.webpackOutput;
    config.context = paths.testStagingPath;
    config.resolveLoader = config.resolveLoader || {};
    config.resolveLoader.alias = config.resolveLoader.alias || {};
    config.resolveLoader.alias.newLine = path.join(__dirname, 'newline.loader.js');

    var rules = config.module.rules || config.module.loaders;

    rules.push({ test: /\.js$/, loader: 'newLine' });
    return config;
}

function createWebpackWatchHandler(done, paths, testState, outputs, options, test) {
    return function (err, stats) {
        var patch = setPathsAndGetPatch(paths, testState);

        cleanHashFromOutput(stats, paths.webpackOutput);

        saveOutputIfRequired(saveOutputMode, paths, outputs, options, patch);

        fs.copySync(paths.webpackOutput, paths.actualOutput);
        rimraf.sync(paths.webpackOutput);

        handleErrors(err, paths, outputs, patch, options);

        storeStats(stats, testState, paths, outputs, patch, options);

        compareFiles(paths, options, test, patch);

        copyPatchOrEndTest(paths.testStagingPath, testState.watcher, testState, done);
    }
}

function setPathsAndGetPatch(paths, testState) {
    var patch = '';
    if (testState.iteration > 0) {
        patch = 'patch' + (testState.iteration - 1);
        paths.actualOutput = path.join(paths.testStagingPath, 'actualOutput', patch);
        paths.expectedOutput = path.join(paths.testStagingPath, 'expectedOutput-' + typescriptVersion, patch);
        paths.originalExpectedOutput = path.join(testPath, 'expectedOutput-' + typescriptVersion, patch)
        mkdirp.sync(paths.actualOutput);
        mkdirp.sync(paths.expectedOutput);
        if (saveOutputMode) mkdirp.sync(paths.originalExpectedOutput);
    }
    return patch;
}

function saveOutputIfRequired(saveOutputMode, paths, outputs, options, patch) {
    // output results
    if (saveOutputMode) {
        // loop through webpackOutput and rename to .transpiled if needed
        glob.sync('**/*', { cwd: paths.webpackOutput, nodir: true }).forEach(function (file) {
            var patchedFileName = patch + '/' + file;
            outputs.currentSavedOutput[patchedFileName] = fs.readFileSync(path.join(paths.webpackOutput, file), 'utf-8');

            if (options.transpile) {
                if (outputs.regularSavedOutput[patchedFileName] !== outputs.transpiledSavedOutput[patchedFileName]) {
                    var extension = path.extname(file);
                    fs.renameSync(
                        path.join(paths.webpackOutput, file),
                        path.join(paths.webpackOutput, path.basename(file, extension) + '.transpiled' + extension)
                    );
                }
            }
        });

        fs.copySync(paths.webpackOutput, paths.originalExpectedOutput, { clobber: true });
    }
}

function handleErrors(err, paths, outputs, patch, options) {
    if (err) {
        var errFileName = 'err.txt';

        var errString = err.toString()
            .replace(new RegExp(regexEscape(paths.testStagingPath + path.sep), 'g'), '')
            .replace(new RegExp(regexEscape(rootPath + path.sep), 'g'), '')
            .replace(new RegExp(regexEscape(rootPath), 'g'), '')
            .replace(/\.transpile/g, '');

        fs.writeFileSync(path.join(paths.actualOutput, errFileName), errString);
        if (saveOutputMode) {
            var patchedErrFileName = patch + '/' + errFileName;
            outputs.currentSavedOutput[patchedErrFileName] = errString;

            if (options.transpile) {
                if (outputs.regularSavedOutput[patchedErrFileName] !== outputs.transpiledSavedOutput[patchedErrFileName]) {
                    fs.writeFileSync(path.join(paths.originalExpectedOutput, 'err.transpiled.txt'), errString);
                }
            }
            else {
                fs.writeFileSync(path.join(paths.originalExpectedOutput, errFileName), errString);
            }
        }
    }
}

function storeStats(stats, testState, paths, outputs, patch, options) {
    if (stats && stats.hash !== testState.lastHash) {
        testState.lastHash = stats.hash;

        var statsFileName = 'output.txt';

        // do a little magic to normalize `\` to `/` for asset output
        var newAssets = {};
        Object.keys(stats.compilation.assets).forEach(function (asset) {
            newAssets[asset.replace(/\\/g, "/")] = stats.compilation.assets[asset];
        });
        stats.compilation.assets = newAssets;

        var statsString = stats.toString({ timings: false, version: false, hash: false })
            .replace(new RegExp(regexEscape(paths.testStagingPath + path.sep), 'g'), '')
            .replace(new RegExp(regexEscape(rootPath + path.sep), 'g'), '')
            .replace(new RegExp(regexEscape(rootPath), 'g'), '')
            .replace(new RegExp(regexEscape(rootPathWithIncorrectWindowsSeparator), 'g'), '')
            .replace(/\.transpile/g, '');

        fs.writeFileSync(path.join(paths.actualOutput, statsFileName), statsString);
        if (saveOutputMode) {
            var patchedStatsFileName = patch + '/' + statsFileName;
            outputs.currentSavedOutput[patchedStatsFileName] = statsString;

            if (options.transpile) {
                if (outputs.regularSavedOutput[patchedStatsFileName] !== outputs.transpiledSavedOutput[patchedStatsFileName]) {
                    fs.writeFileSync(path.join(paths.originalExpectedOutput, 'output.transpiled.txt'), statsString);
                }
            }
            else {
                fs.writeFileSync(path.join(paths.originalExpectedOutput, statsFileName), statsString);
            }
        }
    }
}

function compareFiles(paths, options, test, patch) {
    if (!saveOutputMode) {
        // massage any .transpiled. files
        glob.sync('**/*', { cwd: paths.expectedOutput, nodir: true }).forEach(function (file) {
            if (/\.transpiled/.test(file)) {
                if (options.transpile) { // rename if we're in transpile mode
                    var extension = path.extname(file);
                    fs.renameSync(
                        path.join(paths.expectedOutput, file),
                        path.join(paths.expectedOutput, path.dirname(file), path.basename(file, '.transpiled' + extension) + extension)
                    );
                }
                else { // otherwise delete
                    fs.unlinkSync(path.join(paths.expectedOutput, file));
                }
            }
        });

        // compare actual to expected
        var actualFiles = glob.sync('**/*', { cwd: paths.actualOutput, nodir: true }),
            expectedFiles = glob.sync('**/*', { cwd: paths.expectedOutput, nodir: true })
                .filter(function (file) { return !/^patch/.test(file); }),
            allFiles = {};

        actualFiles.forEach(function (file) { allFiles[file] = true });
        expectedFiles.forEach(function (file) { allFiles[file] = true });

        Object.keys(allFiles).forEach(function (file) {
            var actual = getNormalisedFileContent(file, paths.actualOutput, test);
            var expected = getNormalisedFileContent(file, paths.expectedOutput, test);

            compareActualAndExpected(test, actual, expected, patch, file);
        });
    }
}

function copyPatchOrEndTest(testStagingPath, watcher, testState, done) {
    // check for new files to copy in
    var patchPath = path.join(testStagingPath, 'patch' + testState.iteration);
    if (fs.existsSync(patchPath)) {
        testState.iteration++;

        // can get inconsistent results if copying right away
        setTimeout(function () {
            fs.copySync(patchPath, testStagingPath, { clobber: true });
        }, 1000);
    }
    else {
        watcher.close(function () {
            // done is occasionally called twice for no known reason
            // when this happens the build fails with "Error: done() called multiple times" - not a meaningful failure
            if (!testState.doneHasBeenCalled) {
                testState.doneHasBeenCalled = true;
                done();
            }
        });
    }
}

/**
 * replace the elements in the output that can change depending on
 * environments; we want to generate a string that is as environment
 * independent as possible
 **/
function cleanHashFromOutput(stats, webpackOutput) {
    var escapedStagingPath = stagingPath.replace(new RegExp(regexEscape('\\'), 'g'), '\\\\');
    if (stats) {
        glob.sync('**/*', { cwd: webpackOutput, nodir: true }).forEach(function (file) {
            var content = fs.readFileSync(path.join(webpackOutput, file), 'utf-8')
                .split(stats.hash).join('[hash]')
                .replace(/\r\n/g, '\n')
                // Ignore complete paths
                .replace(new RegExp(regexEscape(escapedStagingPath), 'g'), '')
                // turn \\ to /
                .replace(new RegExp(regexEscape('\\\\'), 'g'), '/');

            fs.writeFileSync(path.join(webpackOutput, file), content);
        });
    }
}

function getNormalisedFileContent(file, location, test) {
    var fileContent;
    var filePath = path.join(location, file);

    try {
        var originalContent = fs.readFileSync(filePath).toString();
        fileContent = (file.indexOf('output.') === 0
            ? normaliseString(originalContent)
                // We don't want a difference in the number of kilobytes to fail the build
                .replace(/[\d]+([.][\d]*)? KiB/g, 'A-NUMBER-OF KiB')
                // We also don't want a difference in the number of bytes to fail the build
                .replace(/ \d+ bytes /g, ' A-NUMBER-OF bytes ')
                // Ignore whitespace between:     Asset     Size  Chunks             Chunk Names
                .replace(/\s+Asset\s+Size\s+Chunks\s+Chunk Names/, '    Asset     Size  Chunks             Chunk Names')
                // Ignore 'at Object.loader (dist\index.js:32:15)' style row number / column number differences
                .replace(/(\(dist[\/|\\]\w*.js:)(\d*)(:)(\d*)(\))/g, function(match, openingBracketPathAndColon, lineNumber, colon, columnNumber, closingBracket){
                    return openingBracketPathAndColon + 'irrelevant-line-number' + colon + 'irrelevant-column-number' + closingBracket;
                })
            : normaliseString(originalContent))
            // Ignore 'at C:/source/ts-loader/dist/index.js:90:19' style row number / column number differences
            .replace(/at (.*)(dist[\/|\\]\w*.js:)(\d*)(:)(\d*)/g, function(match, spaceAndStartOfPath, remainingPathAndColon, lineNumber, colon, columnNumber){
                return 'at ' + remainingPathAndColon + 'irrelevant-line-number' + colon + 'irrelevant-column-number';
            })
            // strip C:/projects/ts-loader/.test/
            .replace(/ (C\:\/)?[\w|\/]*\/ts-loader\/\.test/g, ' ')
            .replace(/webpack:\/\/(C:\/)?[\w|\/|-]*\/comparison-tests\//g, 'webpack://comparison-tests/')
            .replace(/WEBPACK FOOTER\/n\/ [\w|\/|-]*\/comparison-tests\//, 'WEBPACK FOOTER/n/ /ts-loader/test/comparison-tests/')
            .replace(/!\** [\w|\/|-]*\/comparison-tests\//, '!*** /ts-loader/test/comparison-tests/')
            // with webpack 4 there are different numbers of *s on Windows and on Linux
            .replace(/\*{10}\**/g, '**********');
    } catch (e) {
        fileContent = '!!!' + filePath + ' doesn\'t exist!!!';
    }
    return fileContent;
}

function normaliseString(platformSpecificContent) {
    return platformSpecificContent
        .replace(/\r\n/g, '\n')
        .replace(/\/r\/n/g, '\n')
        .replace(/\\r\\n/g, '\\n') // bundle.js output needs this; tsConfigNotReadable for instance
        // Convert '/' to '\' and back to '/' so slashes are treated the same
        // whether running / generated on windows or *nix
        .replace(new RegExp(regexEscape('/'), 'g'), '\\')
        .replace(new RegExp(regexEscape('\\'), 'g'), '/')
        .replace(new RegExp(regexEscape('//'), 'g'), '/')
        // replace C:/source/ts-loader/index.js or /home/travis/build/TypeStrong/ts-loader/index.js with ts-loader
        .replace(/ \S+[\/|\\]ts-loader[\/|\\]index.js/g, 'ts-loader')
        // replace (C:/source/ts-loader/dist/index.js with (ts-loader)
        .replace(/\(\S+[\/|\\]ts-loader[\/|\\]dist[\/|\\]index.js:\d*:\d*\)/g, '(ts-loader)');
}

/**
 * If a test is marked as flaky then don't fail the build if it doesn't pass
 * Instead, report the differences and carry on
 */
function compareActualAndExpected(test, actual, expected, patch, file) {
    const actualString = actual.toString();
    const expectedString = expected.toString();
    if (testIsFlaky) {
        try {
            assert.equal(actualString, expectedString, (patch ? patch + '/' : patch) + file + ' is different between actual and expected');
        }
        catch (e) {
            console.log("\nFlaky test error!\n");
            console.log("MESSAGE:\n" + e.message, '\n');
            console.log('EXPECTED:\n', e.expected, '\n');
            console.log("ACTUAL:\n", e.actual, '\n');
        }
    }
    else {
        assert.equal(actualString, expectedString, (patch ? patch + '/' : patch) + file + ' is different between actual and expected');
    }
}
