const fs = require('fs-extra');
const path = require('path');
const mkdirp = require('mkdirp');
const copySync = require('./copySync');

fs.readdirSync(__dirname).forEach(function(test) {
    var testPath = path.join(__dirname, test);
    if (fs.statSync(testPath).isDirectory()) {
        
        if (test === 'testLib') return;
        
        // update this manually when a new version comes out
        var expectedOutput = path.join(testPath, 'expectedOutput-3.6'),
            newExpectedOutput = path.join(testPath, 'expectedOutput-3.7');
        
        mkdirp.sync(newExpectedOutput);
        copySync(expectedOutput, newExpectedOutput);
    }
});
