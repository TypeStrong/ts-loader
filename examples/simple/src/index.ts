import { greet, type Greeting } from './greet';

const greeting: Greeting = { name: 'TypeScript 7' };

const heading = document.createElement('h1');
heading.textContent = greet(greeting);
document.body.append(heading);
