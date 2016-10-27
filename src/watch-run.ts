import path = require('path');
import utils = require('./utils');
import interfaces = require('./interfaces');

/**
 * Make function which will manually update changed files
 */
function makeWatchRun(
    instance: interfaces.TSInstance
) {

    return (watching: interfaces.WebpackWatching, cb: () => void) => {
        const mtimes = watching.compiler.watchFileSystem.watcher.mtimes;
        if (null === instance.modifiedFiles) {
            instance.modifiedFiles = {};
        }

        Object.keys(mtimes)
            .filter(filePath => !!filePath.match(/\.tsx?$|\.jsx?$/))
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
