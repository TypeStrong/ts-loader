# HMR with ts-loader

Demonstrating HMR:

1. Setup project: `npm install`
2. Run dev server: `npm run dev`
3. Go to [http://localhost:8080](http://localhost:8080)
4. Notice the string rendered on the page
5. Change the string in `./src/exports-string.ts`
6. Notice the rendered string changed using HMR
7. Repeat steps 5 & 6 as much as you want

## Note
HMR works with `ts-loader` just as it does with vanilla js & webpack, except with 2 caveats:
- `ts-loader` options must have `transpileOnly: true` (see `./webpack.config.js`)
- You must re-require the hot replaced module (see `./src/index.ts`)
