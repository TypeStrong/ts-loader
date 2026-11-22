import { whatNumbersDoYouHave } from "../src/app";

describe("app", () => {
  it("code compiled using projectReferences can be consumed", () => {
    expect(whatNumbersDoYouHave()).toEqual([1, 2, 3]);
  });
});
