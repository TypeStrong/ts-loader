module.exports = function(contents) {
    this.cacheable();
    return contents.replace(/\r\n/g, '\n');
}