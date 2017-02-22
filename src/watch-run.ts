import path = require('path');
import utils = require('./utils');
import interfaces = require('./interfaces');
import constants = require('./constants');

/**
 * Make function which will manually update changed files
 */
function makeWatchRun(
    instance: interfaces.TSInstance
) {
    return (watching: interfaces.WebpackWatching, cb: () => void) => {
        if (null === instance.modifiedFiles) {
            instance.modifiedFiles = {};
        }

        const watcher = watching.compiler.watchFileSystem.watcher ||
            watching.compiler.watchFileSystem.wfs.watcher;

        if (watcher && watcher.mtimes) {
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
        }
        cb();
    };
}

export = makeWatchRun;
