import { Animal, Size } from './animal';
import { makeRandomName } from '@myscope/core';

interface Dog extends Animal {
    woof(): void;
    name: string;
}

const sizes = "small medium large".split(' ');
const barks = "Woof Yap Growl".split(' ');

function createDog(): Dog {
    return ({
        size: sizes[Math.floor(Math.random() * sizes.length)] as Size,
        woof: function(this: Dog) {
            return(`${this.name} says ${barks[Math.floor(Math.random() * barks.length)]}!`);
        },
        name: makeRandomName(),
        // deliberateError: 42
    });
}

export {
  Dog,
  createDog
}


