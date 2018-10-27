import * as app from '../src/app';

// We don't actually care about the result of the following operations;
// what we care about is typescript resolving modules using our custom
// logic, allowing this code to compile without errors, hence this:
// 		"noEmitOnError": true
// in tsconfig.json
describe("app", () => {
  it("app.def to have been setup", () => {
    expect(app.def.hello).toEqual(1);
    expect(app.def.world).toEqual(2);
  });
});
