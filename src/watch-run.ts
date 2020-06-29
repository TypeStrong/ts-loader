import * as path from 'path';
import * as webpack from 'webpack';

import * as constants from './constants';
import { FilePathKey, TSInstance } from './interfaces';
import { updateFileWithText } from './servicesHost';
import { fsReadFile } from './utils';

/**
 * Make function which will manually update changed files
 */
export function makeWatchRun(
  instance: TSInstance,
  loader: webpack.loader.LoaderContext
) {
  // Called Before starting compilation after watch
  const lastTimes = new Map<FilePathKey, number>();
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
        const key = instance.filePathKeyMapper(filePath);
        const lastTime = lastTimes.get(key) || startTime;

        if (date <= lastTime) {
          continue;
        }

        lastTimes.set(key, date);
        promises.push(updateFile(instance, key, filePath, loader, loaderIndex));
      }

      // On watch update add all known dts files expect the ones in node_modules
      // (skip @types/* and modules with typings)
      for (const [key, { fileName }] of instance.files.entries()) {
        if (
          fileName.match(constants.dtsDtsxOrDtsDtsxMapRegex) !== null &&
          fileName.match(constants.nodeModules) === null
        ) {
          promises.push(
            updateFile(instance, key, fileName, loader, loaderIndex)
          );
        }
      }
    }

    // Update all the watched files from solution builder
    if (instance.solutionBuilderHost) {
      for (const [
        key,
        { fileName },
      ] of instance.solutionBuilderHost.watchedFiles.entries()) {
        promises.push(updateFile(instance, key, fileName, loader, loaderIndex));
      }
    }

    Promise.all(promises)
      .then(() => callback())
      .catch(err => callback(err));
  };
}

function updateFile(
  instance: TSInstance,
  key: FilePathKey,
  filePath: string,
  loader: webpack.loader.LoaderContext,
  loaderIndex: number
) {
  return new Promise<void>((resolve, reject) => {
    // When other loaders are specified after ts-loader
    // (e.g. `{ test: /\.ts$/, use: ['ts-loader', 'other-loader'] }`),
    // manually apply them to TypeScript files.
    // Otherwise, files not 'preprocessed' by them may cause complication errors (#1111).
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
          updateFileWithText(instance, key, filePath, () => text);
          resolve();
        }
      });
    } else {
      updateFileWithText(
        instance,
        key,
        filePath,
        nFilePath => fsReadFile(nFilePath) || ''
      );
      resolve();
    }
  });
}
