export class Foo {
	
}

class Bar {
	
}

var a: Number = 'b'; // this should error with 2322

export = Bar; // this should error with 2309 but doesn't since we ignore