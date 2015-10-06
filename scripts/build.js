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

if (semver.lt(typescript.version, '1.6.0-0')) {
	exec('tsc index.ts --module commonjs', cb)
}
else {
	exec('tsc index.ts --module commonjs --moduleResolution classic', cb)
}