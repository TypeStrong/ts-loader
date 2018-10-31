import * as app from '../src/app';

describe("app", () => {
  it("app.def to have been setup", () => {
    expect(app.def.hello).toEqual(1);
    expect(app.def.world).toEqual(2);
  });
});
