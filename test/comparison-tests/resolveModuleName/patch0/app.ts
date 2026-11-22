import { HelloWorld } from 'foo';
import { makeHello } from 'baz';
import { greeting } from './greeting';

export const def: HelloWorld = makeHello(3, 4);

// No longer an error once patch0 makes 'hello' a string in foo-pkg, a file
// TypeScript only reaches through the custom resolver.
export const wrong: string = def.hello;

console.log(greeting, def, wrong);
