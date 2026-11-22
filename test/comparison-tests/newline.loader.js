/**
 * @this {import('webpack').LoaderContext<unknown>}
 * @param {string} contents
 */
module.exports = function(contents) {
    this.cacheable();
    return contents.replace(/\r\n/g, '\n');
}
