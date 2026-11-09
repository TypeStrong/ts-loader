import { HelloWorld } from 'foo';
import { makeHello } from 'baz';
import { greeting } from './greeting';

export const def: HelloWorld = makeHello(1, 2);

// Deliberate type error: only reported this way if 'baz' and 'foo' resolved
// through the custom resolver - otherwise it's a TS2307 "Cannot find module".
export const wrong: string = def.hello;

console.log(greeting, def, wrong);
