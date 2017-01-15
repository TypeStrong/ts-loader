// This test has been ported from the comparison test pack
// ... perhaps it belongs better there though. Will keep for now.

import a = require("../src/a");
import b = require("../src/b");
// modules c and d won't actually be emitted as "require" calls here
// since they are not used directly. Instead, they are only referenced
// with "typeof". At this point, these statements are only for the
// benefit of the TypeScript type system.
import c = require("../src/c");
import d = require("../src/d");

describe("app", () => {
  it("a to be 'a' and b to be 'b'", () => {
    expect(a).toBe("a");
    expect(b).toBe("b");
  });

  it("within require.ensure c to be 'c' and d to be 'd'", done => {
    require.ensure(["../src/c", "../src/d"], function(require) {
      // These require calls are emitted (note these are NOT TypeScript
      // `import ... require` statements). `require.ensure` is defined in
      // require.d.ts. Webpack sees this and automatically puts c and d
      // into a separate chunk. 
      var cModule = <typeof c>require("../src/c");
      var dModule = <typeof d>require("../src/d");
      
      // cModule and dModule will typed as strings
      expect(cModule).toBe("c");
      expect(dModule).toBe("d");

      done();
    });
  });
});
