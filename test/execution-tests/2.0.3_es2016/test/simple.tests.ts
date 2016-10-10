import { adder } from "../src/simple";

describe("simple", () => {
  it("adder can add 2 numbers", () => {
    expect(adder(1, 4)).toBe(5);
  });

  it("Array.prototype.includes works", () => {
    const result = [1, 2, 3].includes(2);
    expect(result).toBe(true);
  });

  it("Exponentiation operator works", () => {
    expect(1 ** 2 === Math.pow(1, 2)).toBe(true);
  });
});
