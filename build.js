var typescript = require('typescript'),
	semver = require('semver'),
	exec = require('child_process').exec;

function cb(error, stdout, stderr) {
    console.log(stdout);
    console.log(stderr);
    if (error) {
      console.log(error);
    }
}

exec('tsc', cb);