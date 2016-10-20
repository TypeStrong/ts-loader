var fs = require('fs-extra');
var path = require('path');
var mkdirp = require('mkdirp');

fs.readdirSync(__dirname).forEach(function(test) {
    var testPath = path.join(__dirname, test);
    if (fs.statSync(testPath).isDirectory()) {
        
        if (test == 'testLib') return;
        
        // update this manually when a new version comes out
        var expectedOutput = path.join(testPath, 'expectedOutput-2.0'),
            newExpectedOutput = path.join(testPath, 'expectedOutput-2.1');
        
        mkdirp.sync(newExpectedOutput);
        fs.copySync(expectedOutput, newExpectedOutput);
    }
});
