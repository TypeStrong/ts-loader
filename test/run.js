var assert = require("assert")
var fs = require('fs');
var path = require('path');
var newLine = require('os').EOL;
var tsLoader = require('../index');
var webpack = require('webpack');

function handleErrors(err, stats, done) {
    if (err) { 
        done(err)
        return true;
    }

    if (stats.hasErrors()) {
        done(new Error(stats.toString({errorDetails: true})))
        return true;
    }
    return false;
}

describe('basic', function() {
    
    it('should have the correct output', function(done) {
        webpack(require('./basic/webpack.config')).run(function(err, stats) {
            if (!handleErrors(err, stats, done)) {
                var statsJson = stats.toJson();
                
                var appModule = statsJson.modules.filter(function(m) { return m.name == './test/basic/app.ts' })[0];
                var subModule = statsJson.modules.filter(function(m) { return m.name == './test/basic/submodule/submodule.ts' })[0];
                var externalLib = statsJson.modules.filter(function(m) { return m.name == './test/basic/lib/externalLib.js' })[0];
                
                assert.equal(appModule.source, 
                    '///<reference path="_references.d.ts" />' + newLine +
                    "var submodule = require('./submodule/submodule');" + newLine +
                    "var externalLib = require('externalLib');" + newLine +
                    "externalLib.doSomething(submodule);" + newLine);

                assert.equal(subModule.source, 
                    'var message = "Hello from submodule";' + newLine +
                    'module.exports = message;' + newLine);
                
                assert.ok(externalLib, 'External lib exists');
                
                done()
            }
        })
    })
})

describe('instance', function() {
    it('should error when incorrectly configured', function(done) {
        webpack(require('./instance/bad.config')).run(function(err, stats) {
            if (err) return done(err)
            
            var errors = stats.toJson().errors;
            
            assert.equal(errors.length, 1, 'Exactly one error should be reported');
            assert.ok(errors[0].indexOf("Subsequent variable declarations must have the same type.  Variable 'someGlobal' must be of type 'number', but here has type 'string'.") != -1, 'The error reported was the wrong error');
            
            done();
        })
    })
    
    it('should not error when correctly configured', function(done) {
        webpack(require('./instance/good.config')).run(function(err, stats) {
            if (!handleErrors(err, stats, done)) {
                done();   
            }
        })
    })
})

describe('sourceMaps', function() {
    it('should be present when turned on', function(done) {
        webpack(require('./sourceMaps/on.config')).run(function(err, stats) {
            if (!handleErrors(err, stats, done)) {
                var statsJson = stats.toJson();
                
                var module = statsJson.modules.filter(function(m) { return m.name == './test/sourceMaps/a.ts' })[0];
                
                assert.equal(module.source, "console.log('Hello world');" + newLine + "//# sourceMappingURL=a.js.map");
                
                done();   
            }
        })
    })
    
    it('should not be present when turned off', function(done) {
        webpack(require('./sourceMaps/off.config')).run(function(err, stats) {
            if (!handleErrors(err, stats, done)) {
                var statsJson = stats.toJson();
                
                var module = statsJson.modules.filter(function(m) { return m.name == './test/sourceMaps/a.ts' })[0];
                
                assert.equal(module.source, "console.log('Hello world');" + newLine);
                
                done();   
            }
        })
    })
    
})

describe('targets', function() {
    it('es3', function(done) {
        webpack(require('./targets/es3.config')).run(function(err, stats) {
            if (err) return done(err)
            
            var errors = stats.toJson().errors;
            
            assert.equal(errors.length, 2, 'Exactly two errors should be reported');
            assert.ok(errors[0].indexOf("Accessors are only available when targeting ECMAScript 5 and higher") != -1, 'The error reported was the wrong error');
            assert.ok(errors[1].indexOf("Typescript emitted no output for") != -1, 'The error reported was the wrong error');
            
            done();
        })
    })
    
    it('es5', function(done) {
        webpack(require('./targets/es5.config')).run(function(err, stats) {
            if (err) return done(err)
            
            var statsJson = stats.toJson(),
                errors = statsJson.errors;
            
            assert.equal(errors.length, 2, 'Exactly two errors should be reported');
            assert.ok(errors[0].indexOf("'let' declarations are only available when targeting ECMAScript 6 and higher") != -1, 'The error reported was the wrong error');
            assert.ok(errors[1].indexOf("Typescript emitted no output for") != -1, 'The error reported was the wrong error');
            
            done();
        })
    })
    
    it('es6', function(done) {
        webpack(require('./targets/es6.config')).run(function(err, stats) {
            if (!handleErrors(err, stats, done)) {
                done();   
            }
        })
    })
    
})

describe('module', function() {
    
    it('commonjs', function(done) {
        webpack(require('./module/commonjs.config')).run(function(err, stats) {
            if (!handleErrors(err, stats, done)) {
                var statsJson = stats.toJson();
                
                var module = statsJson.modules.filter(function(m) { return m.name == './test/module/a.ts' })[0];
                
                assert.ok(!module.source.match(/^define/));
                
                done();   
            }
        })
    })
    
    it('amd', function(done) {
        webpack(require('./module/amd.config')).run(function(err, stats) {
            if (!handleErrors(err, stats, done)) {
                var statsJson = stats.toJson();
                
                var module = statsJson.modules.filter(function(m) { return m.name == './test/module/a.ts' })[0];
                
                assert.ok(module.source.match(/^define/));
                
                done();   
            }
        })
    })
    
})