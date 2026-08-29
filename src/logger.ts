import { Console } from 'console';

import type { ColorFn, Colors } from './colors';
import { LogLevel } from './types';

interface InternalLoggerFunction {
  (whereToLog: Console, message: string): void;
}

interface LoggerFunction {
  (message: string): void;
}

export interface Logger {
  logInfo: LoggerFunction;
  logWarning: LoggerFunction;
  logError: LoggerFunction;
}

const stderrConsole = new Console(process.stderr);
const stdoutConsole = new Console(process.stdout);

function doNothingLogger(_message: string): void {}

function makeLoggerFunc(silent: boolean): InternalLoggerFunction {
  if (silent) {
    return function (_whereToLog: Console, _message: string): void {};
  }

  return function (whereToLog: Console, message: string): void {
    console.log.call(whereToLog, message);
  };
}

function makeLog({
  logLevel,
  logger,
  level,
  whereToLog,
  color,
}: {
  logLevel: keyof typeof LogLevel;
  logger: InternalLoggerFunction;
  level: number;
  whereToLog: Console;
  color: ColorFn;
}): LoggerFunction {
  if (LogLevel[logLevel] <= level) {
    return function (message: string): void {
      logger(whereToLog, color(message));
    };
  }

  return doNothingLogger;
}

export function makeLogger({
  logLevel,
  logInfoToStdOut,
  silent,
  colors,
}: {
  logLevel: keyof typeof LogLevel;
  logInfoToStdOut: boolean;
  silent: boolean;
  colors: Colors;
}): Logger {
  const logger = makeLoggerFunc(silent);
  return {
    logInfo: makeLog({
      logLevel,
      logger,
      level: LogLevel.INFO,
      whereToLog: logInfoToStdOut ? stdoutConsole : stderrConsole,
      color: colors.green,
    }),
    logWarning: makeLog({
      logLevel,
      logger,
      level: LogLevel.WARN,
      whereToLog: stderrConsole,
      color: colors.yellow,
    }),
    logError: makeLog({
      logLevel,
      logger,
      level: LogLevel.ERROR,
      whereToLog: stderrConsole,
      color: colors.red,
    }),
  };
}
