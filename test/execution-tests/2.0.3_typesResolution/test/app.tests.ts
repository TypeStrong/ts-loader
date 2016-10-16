import submodule = require('../src/app');

// The actual test here is that @types/jasmine is being resolved
describe("app", () => {
  it("andWeGot can be called and returns the expected value", () => {
    expect(submodule.andWeGot()).toBe("well we got aaaa");
  });
});
