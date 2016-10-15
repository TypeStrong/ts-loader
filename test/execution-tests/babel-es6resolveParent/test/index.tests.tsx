import exportedValue, { Component } from "../src/submodule/index";

describe("index", () => {
  it("exportedValue is 'foo'", () => {
    expect(exportedValue).toBe("foo");
  });

  it("Component ", () => {
    expect(new Component().helloFromTheBase()).toBe("hiya");
  });
});
