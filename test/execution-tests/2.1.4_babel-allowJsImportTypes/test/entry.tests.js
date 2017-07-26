var entry = require('../src/entry');

describe("entry", function() {
  it("getEventRank produces something", function() {
    var EventRank = entry.getEventRank();
    expect(EventRank).not.toBeUndefined();
  });
});
