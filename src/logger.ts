import interfaces = require('./interfaces');
var Console = require('console').Console;

const stderrConsole = new Console(process.stderr);
const stdoutConsole = new Console(process.stdout);

enum LogLevel {
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

interface Logger {
    (whereToLog: any, messages: string[]): void
}

function makeLogger(loaderOptions: interfaces.LoaderOptions) {
    return loaderOptions.silent 
        ? (whereToLog: any, messages: string[]) => {}
        : (whereToLog: any, messages: string[]) => console.log.apply(whereToLog, messages);
}

function makeExternalLogger(loaderOptions: interfaces.LoaderOptions, logger: Logger) {
    const output = loaderOptions.logInfoToStdOut ? stdoutConsole : stderrConsole;
    return (...messages: string[]) => logger(output, messages);
}

function makeLogInfo(loaderOptions: interfaces.LoaderOptions, logger: Logger) {
    return LogLevel[loaderOptions.logLevel] <= LogLevel.INFO
        ? (...messages: string[]) => logger(loaderOptions.logInfoToStdOut ? stdoutConsole : stderrConsole, messages)
        : (...messages: string[]) => {}
}

function makeLogError(loaderOptions: interfaces.LoaderOptions, logger: Logger) {
    return LogLevel[loaderOptions.logLevel] <= LogLevel.ERROR
        ? (...messages: string[]) => logger(stderrConsole, messages)
        : (...messages: string[]) => {}
}

function makeLogWarning(loaderOptions: interfaces.LoaderOptions, logger: Logger) {
    return LogLevel[loaderOptions.logLevel] <= LogLevel.WARN
        ? (...messages: string[]) => logger(stderrConsole, messages)
        : (...messages: string[]) => {}
}

function getLogger(loaderOptions: interfaces.LoaderOptions) {
    const logger = makeLogger(loaderOptions);
    return {
        log: makeExternalLogger(loaderOptions, logger),
        logInfo: makeLogInfo(loaderOptions, logger),
        logWarning: makeLogWarning(loaderOptions, logger),
        logError: makeLogError(loaderOptions, logger)
    }
}

export = getLogger;