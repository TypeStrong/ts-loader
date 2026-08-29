import { Console } from 'console';

import type { Colors } from './colors';
import { LogLevel } from './types';

export interface Logger {
  logInfo: (message: string) => void;
}

const stderrConsole = new Console(process.stderr);
const stdoutConsole = new Console(process.stdout);

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
  if (silent || LogLevel[logLevel] > LogLevel.INFO) {
    return { logInfo: () => {} };
  }

  const whereToLog = logInfoToStdOut ? stdoutConsole : stderrConsole;
  return {
    logInfo: message => console.log.call(whereToLog, colors.green(message)),
  };
}
