import * as path from 'path';
import * as webpack from 'webpack';

import * as constants from './constants';
import { TSFile, TSInstance } from './interfaces';
import { readFile } from './utils';

/**
 * Make function which will manually update changed files
 */
export function makeWatchRun(instance: TSInstance) {
  // Called Before starting compilation after watch
  const lastTimes = new Map<string, number>();
  const startTime = 0;

  return (compiler: webpack.Compiler, callback: () => void) => {
    if (null === instance.modifiedFiles) {
      instance.modifiedFiles = new Map<string, TSFile>();
    }

    // startTime = startTime || watching.startTime;
    const times = compiler.fileTimestamps;
    for (const [filePath, date] of times) {
      if (
        date > (lastTimes.get(filePath) || startTime) &&
        filePath.match(constants.tsTsxJsJsxRegex) !== null
      ) {
        continue;
      }

      lastTimes.set(filePath, date);

      updateFile(instance, filePath);
    }

    // On watch update add all known dts files expect the ones in node_modules
    // (skip @types/* and modules with typings)
    for (const filePath of instance.files.keys()) {
      if (
        filePath.match(constants.dtsDtsxOrDtsDtsxMapRegex) !== null &&
        filePath.match(constants.nodeModules) === null
      ) {
        updateFile(instance, filePath);
      }
    }

    callback();
  };
}

function updateFile(instance: TSInstance, filePath: string) {
  const nFilePath = path.normalize(filePath);
  const file =
    instance.files.get(nFilePath) || instance.otherFiles.get(nFilePath);
  if (file !== undefined) {
    file.text = readFile(nFilePath) || '';
    file.version++;
    instance.version!++;
    instance.modifiedFiles!.set(nFilePath, file);
    if (instance.watchHost !== undefined) {
      instance.watchHost.invokeFileWatcher(
        nFilePath,
        instance.compiler.FileWatcherEventKind.Changed
      );
    }
  }
}
