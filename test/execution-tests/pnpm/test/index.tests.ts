import { reactVersion } from '../src/index';

describe("app", () => {
  it("andWeGot can be called and returns the expected value", () => {
    expect(reactVersion).toBe("16.0.1");
  });
});
