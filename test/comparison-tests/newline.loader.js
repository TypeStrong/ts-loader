module.exports = function(contents) {
    // @ts-ignore
    this.cacheable();
    return contents.replace(/\r\n/g, '\n');
}