import { reactVersion } from '../src/index';

describe("index", () => {
  it("reactVersion can be called and returns the expected value", () => {
    expect(reactVersion).toBe("16.3.2");
  });
});
