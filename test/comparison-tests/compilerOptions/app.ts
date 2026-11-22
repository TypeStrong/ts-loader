import { name } from './dep';

// with target es2015 the private field is compiled away
export class Greeter {
    #greeting = 'hello';

    greet() {
        return this.#greeting + ' ' + name.toUpperCase();
    }
}
