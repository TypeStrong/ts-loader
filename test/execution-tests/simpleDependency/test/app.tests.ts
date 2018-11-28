import dep = require('../src/dep');

describe("app", () => {
  it("dep can be called", () => {

    expect(dep("nothing")).toBe("doSomething with nothing");
  });
});
