const logger = import('./Logger.mjs');

/**
 * Represents a logger.
 */
type Logger = InstanceType<Awaited<typeof logger>["Logger"]>;

/**
 * Represents an application.
 */
export class App {
    /**
     * A component for writing log-messages.
     */
    private logger: Logger = null;

    /**
     * Gets a component for writing log-messages.
     */
    public get Logger(): Promise<Logger> {
        return (
            async () =>
            {
                if (this.logger === null) {
                    let x = new (await logger).Logger();
                    this.logger = x;
                }

                return this.logger;
            })();
    }
}