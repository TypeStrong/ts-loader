import a from './a';
import b from './b';
// modules c and d won't actually be emitted as "require" calls here
// since they are not used directly. Instead, they are only referenced
// with "typeof". At this point, these statements are only for the
// benefit of the TypeScript type system.
import c from './c';
import d from './d';

console.log(a);
console.log(b);
require.ensure(['./c', './d'], function(require) {
	// These require calls are emitted (note these are NOT TypeScript
	// `import ... require` statements). `require.ensure` is defined in
	// require.d.ts. Webpack sees this and automatically puts c and d
	// into a separate chunk. 
	var cModule = <{ default: typeof c}>require('./c');
	var dModule = <{ default: typeof d}>require('./d');
	
	// cModule and dModule will typed as strings
	console.log(cModule);
	console.log(dModule);
});
