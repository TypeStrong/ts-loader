import * as a from '../src/a';

describe("largeProject", () => {
  it("a can be called", () => {

    expect(a.doSomething("nothing")).toBe("doSomething with nothing");
  });
});
