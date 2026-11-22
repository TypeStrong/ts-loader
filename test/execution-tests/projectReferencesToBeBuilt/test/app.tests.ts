import { whatNumbersDoYouHave } from "../src/app";

describe("app", () => {
  it("code compiles referenced project", () => {
    expect(whatNumbersDoYouHave()).toEqual([1, 2, 3]);
  });
});
