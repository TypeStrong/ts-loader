import a from "../src/a";
import b from "../src/b";

describe("app", () => {
  it("a to be 'a' and b to be 'b' (classic)", () => {
    expect(a).toBe("a");
    expect(b).toBe("b");
  });

  it("await import results in a module with a default", async done => {
    const c = await import("../src/c");
    const d = await import("../src/d");

    // .default is the default export
    expect(c.default).toBe("c");
    expect(d.d).toBe("d");

    done();
  });
});
// npm run execution-tests -- --single-test 2.4.1_babel-importCodeSplitting