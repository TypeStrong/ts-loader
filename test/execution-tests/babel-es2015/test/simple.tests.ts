import exportedValue, { adder } from "../src/simple";

describe("simple", () => {
  it("import destructuring works as expected", () => {
    expect(adder(1, 4)).toBe(5);
  });

  it("import default works as expected", () => {
    expect(exportedValue).toBe("Edmund");
  });

  it("Promise works", done => {
    new Promise<number>((resolve, reject) => {
      resolve(5);
    }).then(result => {
      expect(result).toBe(5);
      done();
    });
  });

  it("Destructuring works", () => {
    const [ first, ...others ] = ["john", "benjamin", "james", "lisette"];
    expect(first).toBe("john")
    expect(others).toEqual(["benjamin", "james", "lisette"])
  });
});
