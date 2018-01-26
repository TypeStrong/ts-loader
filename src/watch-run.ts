import * as path from 'path';

import { readFile } from './utils';
import * as constants from './constants';
import { 
    TSInstance,
    WebpackCompiler,
    TSFile
} from './interfaces';

/**
 * Make function which will manually update changed files
 */
export function makeWatchRun(
    instance: TSInstance
) {
    // Called Before starting compilation after watch
    const lastTimes = new Map<string, number>();
    let startTime = 0;
    
    return (compiler: WebpackCompiler, callback: () => void) => {
        if (null === instance.modifiedFiles) {
            instance.modifiedFiles = new Map<string, TSFile>();
        }
        // startTime = startTime || watching.startTime;
        const times = compiler.fileTimestamps;
        for (const [filePath, date] of times) {
            if (date > (lastTimes.get(filePath) || startTime)
                && filePath.match(constants.tsTsxJsJsxRegex)) {
                continue;
            }

            lastTimes.set(filePath, date);

            const nFilePath = path.normalize(filePath);
            const file = instance.files.get(nFilePath) || instance.otherFiles.get(nFilePath);
            if (file !== undefined) {
                file.text = readFile(nFilePath) || '';
                file.version++;
                instance.version!++;
                instance.modifiedFiles!.set(nFilePath, file);
                if (instance.watchHost) {
                    instance.watchHost.invokeFileWatcher(nFilePath, instance.compiler.FileWatcherEventKind.Changed);
                }
            }
        }

        callback();
    };
}
