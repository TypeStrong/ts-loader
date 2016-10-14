import submodule = require('../src/app');

describe("app", () => {
  it("andWeGot can be called and returns the expected value", () => {
    expect(submodule.andWeGot()).toBe("well we got aaaa");
  });
});
