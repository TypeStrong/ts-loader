const Console = require('console').Console;
import { LoaderOptions } from './interfaces';

const stderrConsole = new Console(process.stderr);
const stdoutConsole = new Console(process.stdout);

enum LogLevel {
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

interface InternalLoggerFunc {
    (whereToLog: any, messages: string[]): void;
}

const doNothingLogger = (..._messages: string[]) => {};

function makeLoggerFunc(loaderOptions: LoaderOptions) {
    return loaderOptions.silent 
        ? (_whereToLog: any, _messages: string[]) => {}
        : (whereToLog: any, messages: string[]) => console.log.apply(whereToLog, messages);
}

function makeExternalLogger(loaderOptions: LoaderOptions, logger: InternalLoggerFunc) {
    const output = loaderOptions.logInfoToStdOut ? stdoutConsole : stderrConsole;
    return (...messages: string[]) => logger(output, messages);
}

function makeLogInfo(loaderOptions: LoaderOptions, logger: InternalLoggerFunc) {
    return LogLevel[loaderOptions.logLevel] <= LogLevel.INFO
        ? (...messages: string[]) => logger(loaderOptions.logInfoToStdOut ? stdoutConsole : stderrConsole, messages)
        : doNothingLogger
}

function makeLogError(loaderOptions: LoaderOptions, logger: InternalLoggerFunc) {
    return LogLevel[loaderOptions.logLevel] <= LogLevel.ERROR
        ? (...messages: string[]) => logger(stderrConsole, messages)
        : doNothingLogger
}

function makeLogWarning(loaderOptions: LoaderOptions, logger: InternalLoggerFunc) {
    return LogLevel[loaderOptions.logLevel] <= LogLevel.WARN
        ? (...messages: string[]) => logger(stderrConsole, messages)
        : doNothingLogger
}

interface LoggerFunc {
    (...messages: string[]): void;
}

export interface Logger {
    log: LoggerFunc;
    logInfo: LoggerFunc;
    logWarning: LoggerFunc;
    logError: LoggerFunc;
}

export function makeLogger(loaderOptions: LoaderOptions): Logger {
    const logger = makeLoggerFunc(loaderOptions);
    return {
        log: makeExternalLogger(loaderOptions, logger),
        logInfo: makeLogInfo(loaderOptions, logger),
        logWarning: makeLogWarning(loaderOptions, logger),
        logError: makeLogError(loaderOptions, logger)
    }
}
