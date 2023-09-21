/* eslint-disable @typescript-eslint/no-empty-function */
import type { Chalk } from 'chalk';
import { Console } from 'console';
import type { LoaderOptions } from './interfaces';

type InternalLoggerFunc = (whereToLog: any, message: string) => void;

type LoggerFunc = (message: string) => void;

export interface Logger {
  log: LoggerFunc;
  logInfo: LoggerFunc;
  logWarning: LoggerFunc;
  logError: LoggerFunc;
}

export enum LogLevel {
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const stderrConsole = new Console(process.stderr);
const stdoutConsole = new Console(process.stdout);

const doNothingLogger = (_message: string) => {};

const makeLoggerFunc = (loaderOptions: LoaderOptions): InternalLoggerFunc =>
  loaderOptions.silent
    ? (_whereToLog: any, _message: string) => {}
    : (whereToLog: any, message: string) =>
        console.log.call(whereToLog, message);

const makeExternalLogger = (
  loaderOptions: LoaderOptions,
  logger: InternalLoggerFunc
) => (message: string) =>
  logger(
    loaderOptions.logInfoToStdOut ? stdoutConsole : stderrConsole,
    message
  );

const makeLogInfo = (
  loaderOptions: LoaderOptions,
  logger: InternalLoggerFunc,
  green: Chalk
) =>
  LogLevel[loaderOptions.logLevel] <= LogLevel.INFO
    ? (message: string) =>
        logger(
          loaderOptions.logInfoToStdOut ? stdoutConsole : stderrConsole,
          green(message)
        )
    : doNothingLogger;

const makeLogError = (
  loaderOptions: LoaderOptions,
  logger: InternalLoggerFunc,
  red: Chalk
) =>
  LogLevel[loaderOptions.logLevel] <= LogLevel.ERROR
    ? (message: string) => logger(stderrConsole, red(message))
    : doNothingLogger;

const makeLogWarning = (
  loaderOptions: LoaderOptions,
  logger: InternalLoggerFunc,
  yellow: Chalk
) =>
  LogLevel[loaderOptions.logLevel] <= LogLevel.WARN
    ? (message: string) => logger(stderrConsole, yellow(message))
    : doNothingLogger;

export function makeLogger(
  loaderOptions: LoaderOptions,
  colors: Chalk
): Logger {
  const logger = makeLoggerFunc(loaderOptions);
  return {
    log: makeExternalLogger(loaderOptions, logger),
    logInfo: makeLogInfo(loaderOptions, logger, colors.green),
    logWarning: makeLogWarning(loaderOptions, logger, colors.yellow),
    logError: makeLogError(loaderOptions, logger, colors.red),
  };
}
