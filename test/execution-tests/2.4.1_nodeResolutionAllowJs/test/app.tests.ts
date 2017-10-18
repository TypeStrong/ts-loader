import * as submodule from '../src/app';

describe("app", () => {
  it("thisShouldNotError returns something", () => {
    expect(submodule.thisShouldNotError()).not.toBe(undefined as any);
  });
});
