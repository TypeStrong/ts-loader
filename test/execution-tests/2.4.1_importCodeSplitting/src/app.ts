import a from './a';
import b from './b';

console.log(a);
console.log(b);

const d = import('./d').then(d => {
    console.log(d.d);
})

async () => {
    const c = await import('./c');
    console.log(c.default);
}  
