import * as path from 'path';

import { readFile } from './utils';
import * as constants from './constants';
import { 
    TSInstance,
    WebpackWatching
} from './interfaces';

/**
 * Make function which will manually update changed files
 */
export function makeWatchRun(
    instance: TSInstance
) {
    // Called Before starting compilation after watch
    const lastTimes = {};
    let startTime : number | null = null;
    
    return (watching: WebpackWatching, callback: () => void) => {
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
                const file = instance.files[filePath] || instance.otherFiles[filePath];
                if (file !== undefined) {
                    file.text = readFile(filePath) || '';
                    file.version++;
                    instance.version!++;
                    instance.modifiedFiles![filePath] = file;
                    if (instance.watchHost) {
                        instance.watchHost.invokeFileWatcher(filePath, instance.compiler.FileWatcherEventKind.Changed);
                    }
                }
            });
        callback();
    };
}
