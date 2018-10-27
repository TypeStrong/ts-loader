import * as app from '../src/app';

// We don't actually care about the result of the following operations;
// what we care about is typescript resolving json as modules
// allowing this code to compile without errors, hence this:
// 		"noEmitOnError": true
// in tsconfig.json
describe("app", () => {
  it("makeHello to exist", () => {
    expect(!!app.makeHello).toBe(true);
  });
});
