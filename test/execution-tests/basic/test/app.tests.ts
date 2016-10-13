import submodule = require('../src/submodule/submodule');
import externalLib = require('externalLib');

describe("app", () => {
  it("externalLib can be called", () => {
    expect(externalLib.doSomething(submodule)).toBeUndefined();
  });

  it("submodule return value can be reached", () => {
    expect(submodule).toBe("Hello from submodule");
  });
});
