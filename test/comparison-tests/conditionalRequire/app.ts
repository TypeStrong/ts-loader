// Optionally import module for typing.
// This will be removed during TypeScript compilation since
// its not directly used.
import debugModule = require('./debug')

console.log('do something')

// The DEBUG constant will be inlined by webpack's DefinePlugin (see config)
// The whole if-statement can then be removed by UglifyJS
if (DEBUG) {
	var debug = <typeof debugModule>require('./debug');
	debug('uhh ohh')
}

console.log('do something else')