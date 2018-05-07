describe("whitelisted", () => {
  it("module can be imported", () => {
    const whitelisted = require('../src/whitelisted');

    expect(whitelisted.get()).toBe("my whitelisted module");
  });

  it("file can be imported", () => {
    const whitelisted = require('../src/whitelisted_file');

    expect(whitelisted.get()).toBe("a whitelisted file");
  });
});