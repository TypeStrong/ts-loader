import a from './a';
import b from'./b';
// modules c and d won't actually be emitted here
// since they are not used directly. Instead, they are only referenced
// with "typeof". At this point, these statements are only for the
// benefit of the TypeScript type system.
import c from './c'; // you can import like this
import * as d from './d'; // or like this depending on your use case

console.log(a);
console.log(b);
require.ensure(['./c', './d'], function(require) {
	// These require calls are emitted (note these are NOT TypeScript
	// `import ... from` statements). `require.ensure` is defined in
	// require.d.ts. Webpack sees this and automatically puts c and d
	// into a separate chunk. 
	
	// Note that requiring an ES6 module always returns an object
	// with the named exports. This means if you want to access
	// the default export you have to do so manually.
	
	// Since we used syntactic sugar for the default export for c, we
	// go ahead and access the default property.
	var cDefault = <typeof c>require('./c')["default"];
	
	// For d, we imported the whole module so we don't access the default
	// property yet. 
	var dModule = <typeof d>require('./d');
	
	console.log(cDefault);
	console.log(dModule["default"]);
});