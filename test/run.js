var assert = require("assert")
var fs = require('fs');
var path = require('path');
var tsLoader = require('../index');
var webpack = require('webpack');

var tests = [
    {
        name: "basic", 
        modules: [
            "./test/basic/app.ts", 
            "./test/basic/submodule/submodule.ts",
            "./test/basic/lib/externalLib.js"
        ]
    }
 ]

tests.forEach(function(test) {
    describe(test.name, function() {
        it('should have the correct output', function(done) {
            var testConfig = require('./'+test.name+'/webpack.config')

            webpack(testConfig).run(function(err, stats) {
                if (err) return done(err)
                
                if (stats.hasErrors()) {
                    return done(new Error(stats.toString({errorDetails: true})))
                }
                
                var exportedModuleNames = stats.toJson().modules.map(function(m) { return m.name });
                
                assert.deepEqual(exportedModuleNames.sort(), test.modules.sort());
                
                done()
            })
        })
    })
})