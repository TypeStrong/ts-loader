import { Console } from 'console';

import type { ColorFn, Colors } from './colors';
import type { LoaderOptions } from './types';

type InternalLoggerFunc = (whereToLog: Console, message: string) => void;
type LoggerFunc = (message: string) => void;

export interface Logger {
  log: LoggerFunc;
  logInfo: LoggerFunc;
  logWarning: LoggerFunc;
  logError: LoggerFunc;
}

const LogLevel = {
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

const stderrConsole = new Console(process.stderr);
const stdoutConsole = new Console(process.stdout);

function doNothingLogger(_message: string): void {}

function makeLoggerFunc(loaderOptions: LoaderOptions): InternalLoggerFunc {
  if (loaderOptions.silent) {
    return function (_whereToLog: Console, _message: string): void {};
  }

  return function (whereToLog: Console, message: string): void {
    console.log.call(whereToLog, message);
  };
}

function makeExternalLogger(
  loaderOptions: LoaderOptions,
  logger: InternalLoggerFunc,
): LoggerFunc {
  return function (message: string): void {
    logger(
      loaderOptions.logInfoToStdOut ? stdoutConsole : stderrConsole,
      message,
    );
  };
}

function makeLogInfo(
  loaderOptions: LoaderOptions,
  logger: InternalLoggerFunc,
  green: ColorFn,
): LoggerFunc {
  if (LogLevel[loaderOptions.logLevel] <= LogLevel.INFO) {
    return function (message: string): void {
      logger(
        loaderOptions.logInfoToStdOut ? stdoutConsole : stderrConsole,
        green(message),
      );
    };
  }

  return doNothingLogger;
}

function makeLogError(
  loaderOptions: LoaderOptions,
  logger: InternalLoggerFunc,
  red: ColorFn,
): LoggerFunc {
  if (LogLevel[loaderOptions.logLevel] <= LogLevel.ERROR) {
    return function (message: string): void {
      logger(stderrConsole, red(message));
    };
  }

  return doNothingLogger;
}

function makeLogWarning(
  loaderOptions: LoaderOptions,
  logger: InternalLoggerFunc,
  yellow: ColorFn,
): LoggerFunc {
  if (LogLevel[loaderOptions.logLevel] <= LogLevel.WARN) {
    return function (message: string): void {
      logger(stderrConsole, yellow(message));
    };
  }

  return doNothingLogger;
}

export function makeLogger(
  loaderOptions: LoaderOptions,
  colors: Colors,
): Logger {
  const logger = makeLoggerFunc(loaderOptions);
  return {
    log: makeExternalLogger(loaderOptions, logger),
    logInfo: makeLogInfo(loaderOptions, logger, colors.green),
    logWarning: makeLogWarning(loaderOptions, logger, colors.yellow),
    logError: makeLogError(loaderOptions, logger, colors.red),
  };
}
