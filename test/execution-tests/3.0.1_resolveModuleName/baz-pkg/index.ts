import {HelloBuilder} from 'bar';

export const makeHello: HelloBuilder = (hello: number, world: number) => ({
  hello,
  world,
});
