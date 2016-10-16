import submodule = require('../src/app');

// The actual test here is that @types/jasmine is being resolved
describe("app", () => {
  it("this test is detected", () => {
    // We don't actually care about the result of the following operation; 
    // what we care about is typescript resolving @types/jasmine and 
    // allowing this code to compile without errors, hence this:
    // 		"noEmitOnError": true
    // in tsconfig.json
    expect(submodule.andWeGot()).toBe("well we got aaaa");
  });
});
