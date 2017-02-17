import path = require('path');
import utils = require('./utils');
import interfaces = require('./interfaces');
import constants = require('./constants');

/**
 * Make function which will manually update changed files
 */
function makeWatchRun(
    instance: interfaces.TSInstance,
    loader: interfaces.Webpack
) {
    // always output stats
    var lastHash: string;
    const outputOptions = loader.outputOptions || {};
    loader._compiler.plugin('done', (stats: any) => {
        if (lastHash === stats.hash && !outputOptions.json)  {
            process.stdout.write(stats.toString(outputOptions) + '\n');
        }
        lastHash = stats.hash;
    });

    return (watching: interfaces.WebpackWatching, cb: () => void) => {
        const watcher = watching.compiler.watchFileSystem.watcher ||
            watching.compiler.watchFileSystem.wfs.watcher;
        if (null === instance.modifiedFiles) {
            instance.modifiedFiles = {};
        }

        Object.keys(watcher.mtimes)
            .filter(filePath => !!filePath.match(constants.tsTsxJsJsxRegex))
            .forEach(filePath => {
                filePath = path.normalize(filePath);
                const file = instance.files[filePath];
                if (file) {
                    file.text = utils.readFile(filePath) || '';
                    file.version++;
                    instance.version++;
                    instance.modifiedFiles[filePath] = file;
                }
            });
        cb();
    };
}

export = makeWatchRun;
