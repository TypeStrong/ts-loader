interface AType { a: string; }
interface BType extends AType { b: string; }

class Foo {
	getSomething(): AType {
		return null;
	}
}

var foo = new Foo();
var x:BType = foo.getSomething();