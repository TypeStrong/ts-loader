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

  // Save the loader index.
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
        promises.push(updateFile(instance, filePath, loader, loaderIndex));
      }

      // On watch update add all known dts files expect the ones in node_modules
      // (skip @types/* and modules with typings)
      for (const filePath of instance.files.keys()) {
        if (
          filePath.match(constants.dtsDtsxOrDtsDtsxMapRegex) !== null &&
          filePath.match(constants.nodeModules) === null
        ) {
          promises.push(updateFile(instance, filePath, loader, loaderIndex));
        }
      }
    }

    // Update all the watched files from solution builder
    if (instance.solutionBuilderHost) {
      for (const filePath of instance.solutionBuilderHost.watchedFiles.keys()) {
        promises.push(updateFile(instance, filePath, loader, loaderIndex));
      }
    }

    Promise.all(promises)
      .then(() => callback())
      .catch(err => callback(err));
  };
}

function updateFile(
  instance: TSInstance,
  filePath: string,
  loader: webpack.loader.LoaderContext,
  loaderIndex: number
) {
  return new Promise<void>((resolve, reject) => {
    if (
      loaderIndex + 1 < loader.loaders.length &&
      instance.rootFileNames.has(path.normalize(filePath))
    ) {
      let request = `!!${path.resolve(__dirname, 'stringify-loader.js')}!`;
      for (let i = loaderIndex + 1; i < loader.loaders.length; ++i) {
        request += loader.loaders[i].request + '!';
      }
      request += filePath;
      loader.loadModule(request, (err, source) => {
        if (err) {
          reject(err);
        } else {
          const text = JSON.parse(source);
          updateFileWithText(instance, filePath, () => text);
          resolve();
        }
      });
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
