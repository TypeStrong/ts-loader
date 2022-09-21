import chalk, { Chalk } from 'chalk';
import { Exception } from './Exception.cjs';
import { Messages } from './Messages.js';
import { ProjectName } from './ProjectName.mjs';

/**
 * Provides the functoinality to log messages to the console.
 */
export class Logger {
    /**
     * Gets the name of the logger.
     */
    public get LoggerName(): string {
        return ProjectName;
    }

    /**
     * Gets a class for representing exceptions.
     */
    public get Exception(): typeof Exception {
        return Exception;
    }

    /**
     * Gets the default messages.
     */
    public get Messages(): typeof Messages {
        return Messages;
    }

    /**
     * Gets a component for formatting messages.
     */
    public get Chalk(): Chalk {
        return chalk;
    }

    /**
     * Prints a message to the console.
     *
     * @param message
     * The message to log.
     */
    public Log(message: string) {
        console.log(this.Chalk.whiteBright(message));
    }
}