import { usingMathutils } from "../src/simple";

describe("simple", () => {
  it("usingMathutils successfully uses the mathutils module", () => {
    expect(usingMathutils()).toBe("with 1.2 we can make 7");
  });
});
