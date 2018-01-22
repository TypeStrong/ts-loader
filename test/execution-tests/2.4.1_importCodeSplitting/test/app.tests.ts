import a from "../src/a";
import b from "../src/b";

describe("app", () => {
  it("a to be 'a' and b to be 'b' (classic)", () => {
    expect(a).toBe("a");
    expect(b).toBe("b");
  });

  it("import results in a module with a default export", done => {
    import("../src/c").then(c => {
      // .default is the default export
      expect(c.default).toBe("c");

      done();
    });
  });

  it("import results in a module with an export", done => {
    import("../src/d").then(d => {
      // .default is the default export
      expect(d.d).toBe("d");

      done();
    });
  });

  it("await import results in a module with a default export", async done => {
    const c = await import("../src/c");

    // .default is the default export
    expect(c.default).toBe("c");

    done();
  });

  it("await import results in a module with an export", async done => {
    const d = await import("../src/d");

    expect(d.d).toBe("d");

    done();
  });
});
