declare function require(path:string): any; 
var dep = require('../src/dep');

describe("app", function() {
  it("dep can be called", function() {
    var result = dep("nothing");
    expect(result).toBe("doSomething with nothing");
  });
});
