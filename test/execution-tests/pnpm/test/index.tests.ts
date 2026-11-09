import { reactVersion } from '../src/index';

describe("index", () => {
  it("reactVersion can be called and returns the expected value", () => {
    expect(reactVersion).toBe("18.3.1");
  });
});
