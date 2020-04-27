import * as webpack from 'webpack';

import * as constants from './constants';
import { TSInstance } from './interfaces';
import { updateFileWithText } from './servicesHost';
import { readFile } from './utils';

/**
 * Make function which will manually update changed files
 */
export function makeWatchRun(instance: TSInstance) {
  // Called Before starting compilation after watch
  const lastTimes = new Map<string, number>();
  const startTime = 0;

  return (compiler: webpack.Compiler, callback: () => void) => {
    if (instance.loaderOptions.transpileOnly) {
      instance.reportTranspileErrors = true;
    } else {
      const times = compiler.fileTimestamps;

      for (const [filePath, date] of times) {
        const lastTime = lastTimes.get(filePath) || startTime;

        if (date <= lastTime) {
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
    }

    // Update all the watched files from solution builder
    if (instance.solutionBuilderHost) {
      for (const filePath of instance.solutionBuilderHost.watchedFiles.keys()) {
        updateFile(instance, filePath);
      }
    }

    callback();
  };
}

function updateFile(instance: TSInstance, filePath: string) {
  updateFileWithText(
    instance,
    filePath,
    nFilePath => readFile(nFilePath) || ''
  );
}
