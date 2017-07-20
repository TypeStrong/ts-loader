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
    const lastTimes = {};
    let startTime : number | null = null;
    return (watching: interfaces.WebpackWatching, cb: () => void) => {
        if (null === instance.modifiedFiles) {
            instance.modifiedFiles = {};
        }
        startTime = startTime || watching.startTime;
        const times = watching.compiler.fileTimestamps;
        Object.keys(times)
            .filter(filePath =>
                times[filePath] > (lastTimes[filePath] || startTime)
                && filePath.match(constants.tsTsxJsJsxRegex)
            )
            .forEach(filePath => {
                lastTimes[filePath] = times[filePath];
                filePath = path.normalize(filePath);
                const file = instance.files[filePath];
                if (file) {
                    file.text = utils.readFile(filePath) || '';
                    file.version++;
                    instance.version!++;
                    instance.modifiedFiles![filePath] = file;
                }
            });
        cb();
    };
}

export = makeWatchRun;
