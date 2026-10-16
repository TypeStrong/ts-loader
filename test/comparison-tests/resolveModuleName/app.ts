import { HelloWorld } from 'foo';
import { makeHello } from './dep';

const helloWorld: HelloWorld = makeHello(1, 2);
console.log(helloWorld.hello);
