// Only referenced with `typeof`, so TypeScript doesn't emit these as requires;
// they're for the type system. webpack sees `require.ensure` below and puts
// c and d into a separate chunk.
import c from "../src/c";
import * as d from "../src/d";

declare var require: {
  <T>(path: string): T;
  ensure: (paths: string[], callback: (require: <T>(path: string) => T) => void) => void;
};

describe("require.ensure", () => {
  it("within require.ensure c to be 'c' and d to be 'd'", done => {
    require.ensure(["../src/c", "../src/d"], function(require) {
      const cModule = require<{ default: typeof c }>("../src/c");
      const dModule = require<typeof d>("../src/d");

      expect(cModule.default).toBe("c");
      expect(dModule.d).toBe("d");

      done();
    });
  });
});
