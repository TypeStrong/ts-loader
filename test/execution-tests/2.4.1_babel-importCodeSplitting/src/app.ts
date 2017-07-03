import a from './a';
import b from './b';

console.log(a);
console.log(b);

async () => {
    const c = await import('./c');
    console.log(c.default);
}  