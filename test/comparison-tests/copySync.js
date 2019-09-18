const fs = require('fs');
const path = require('path');

module.exports = function copySync(src, dest) {
    try {
        fs.mkdirSync(dest);
    }
    catch (e) {
        if (e.code !== "EEXIST") {
            // Failed for some other reason (access denied?); still throw
            throw e;
        }
    }

    for (const entry of fs.readdirSync(src)) {
        // This is necessary because on some file system node fails to exclude
        // "." and "..". See https://github.com/nodejs/node/issues/4002
        if (entry === "." || entry === "..") {
            continue;
        }
        const srcName = path.resolve(src, entry);
        const destName = path.resolve(dest, entry);

        let stat;
        try {
            stat = fs.lstatSync(srcName);
        }
        catch (e) {
            continue;
        }

        if (stat.isSymbolicLink()) {
            fs.symlinkSync(fs.readlinkSync(srcName), destName);
        }
        else if (stat.isFile()) {
            // Write the file
            fs.writeFileSync(destName, fs.readFileSync(srcName));
        }
        else if (stat.isDirectory()) {
            copySync(srcName, destName);
        }
    }
}