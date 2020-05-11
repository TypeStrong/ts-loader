import submodule = require('../src/submodule/submodule');
import submodule2 = require('../src/submodule/submodule2');
import submodule3 = require('../src/submodule/submodule3');
import externalLib = require('externalLib');

describe("app", () => {
  it("externalLib can be called", () => {
    expect(externalLib.doSomething(submodule)).toBeUndefined();
  });

  it("submodule return value should not be transformed", () => {
    expect(submodule).toBe("Hello "+"from submodule");
  });

  it("submodule2 return value should be transformed", () => {
    expect(submodule2).toBe("HELLO "+"FROM SUBMODULE2");
  });
  
  it("submodule3 return value should not be transformed", () => {
    expect(submodule3).toBe("Hello "+"from submodule3");
  });
});
