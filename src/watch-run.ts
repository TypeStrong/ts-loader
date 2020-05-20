import * as fs from 'fs';
import * as loaderRunner from 'loader-runner';
import * as path from 'path';
import * as webpack from 'webpack';

import * as constants from './constants';
import { TSInstance } from './interfaces';
import { updateFileWithText } from './servicesHost';
import { readFile } from './utils';

/**
 * Make function which will manually update changed files
 */
export function makeWatchRun(
  instance: TSInstance,
  loader: webpack.loader.LoaderContext
) {
  // Called Before starting compilation after watch
  const lastTimes = new Map<string, number>();
  const startTime = 0;

  // Save the loader index. 'loader.loaderIndex' is set to '-1' after all the loaders are run.
  const loaderIndex = loader.loaderIndex;

  return (compiler: webpack.Compiler, callback: (err?: Error) => void) => {
    const promises = [];
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
        promises.push(updateFile(instance, loader, loaderIndex, filePath));
      }

      // On watch update add all known dts files expect the ones in node_modules
      // (skip @types/* and modules with typings)
      for (const filePath of instance.files.keys()) {
        if (
          filePath.match(constants.dtsDtsxOrDtsDtsxMapRegex) !== null &&
          filePath.match(constants.nodeModules) === null
        ) {
          promises.push(updateFile(instance, loader, loaderIndex, filePath));
        }
      }
    }

    // Update all the watched files from solution builder
    if (instance.solutionBuilderHost) {
      for (const filePath of instance.solutionBuilderHost.watchedFiles.keys()) {
        promises.push(updateFile(instance, loader, loaderIndex, filePath));
      }
    }

    Promise.all(promises)
      .then(() => callback())
      .catch(err => callback(err));
  };
}

function updateFile(
  instance: TSInstance,
  loader: webpack.loader.LoaderContext,
  loaderIndex: number,
  filePath: string
) {
  return new Promise<void>((resolve, reject) => {
    if (instance.rootFileNames.has(path.normalize(filePath))) {
      loaderRunner.runLoaders(
        {
          resource: filePath,
          loaders: loader.loaders
            .slice(loaderIndex + 1)
            .map(l => ({ loader: l.path, options: l.options })),
          context: {},
          readResource: fs.readFile.bind(fs)
        },
        (err, result) => {
          if (err) {
            reject(err);
          } else {
            const text = result.result![0]!.toString();
            updateFileWithText(instance, filePath, () => text);
            resolve();
          }
        }
      );
    } else {
      updateFileWithText(
        instance,
        filePath,
        nFilePath => readFile(nFilePath) || ''
      );
      resolve();
    }
  });
}
