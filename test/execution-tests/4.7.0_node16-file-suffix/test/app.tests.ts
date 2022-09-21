import { App } from '../src/app';

describe("app", () => {
  it("output is valid", () => {
    expect(() => new App()).not.toThrow();
  });

  it("individual ESModules files are imported properly", async () => {
    const logger = await new App().Logger;
    expect(logger.Log).not.toBeNull();
  });

  it("ESModule packages are imported properly", async () => {
    const logger = await new App().Logger;
    expect(logger.Chalk.whiteBright).not.toBeUndefined();
    expect(() => logger.Chalk.whiteBright("hello world")).not.toThrow();
  });

  it("other files can be imported from individual ESModule files", async () => {
    const logger = await new App().Logger;
    expect(typeof logger.LoggerName).toBe("string");
    expect(typeof logger.Messages.UnknownError).toBe("string");
    expect(new (logger.Exception)() instanceof Error).toBeTruthy();
  });
});