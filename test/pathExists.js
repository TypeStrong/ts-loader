var fs = require('fs');

module.exports = function pathExists(path) {
    var pathExists = true;
    try {
        fs.accessSync(path, fs.F_OK);
    } catch (e) {
        pathExists = false;
    }
    return pathExists;
}
