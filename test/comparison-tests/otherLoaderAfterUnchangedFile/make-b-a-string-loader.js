module.exports = function (contents) {
  return contents.replace('b: number = 1', "b: string = 'one'");
};
