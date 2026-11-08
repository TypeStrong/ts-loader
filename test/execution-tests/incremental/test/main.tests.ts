import main from '../src/main';

describe("main", () => {
  it("should compile successfully", () => {
    // blank expectation, actual failure is in build
    expect(main).not.toBeNull();
  });
});
