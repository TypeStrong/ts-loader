# TypeScript 7 + ts-loader

A minimal webpack 5 setup using `ts-loader` v10 with TypeScript 7 (the native, `tsgo`-powered compiler).

```shell
npm install

# Start the dev server (http://localhost:8080)
npm start

# Production build to ./dist
npm run build
```

Notes:

- `ts-loader` is installed from this repository (`file:../..`), so run `npm run build` in the repository root first. Once v10 is published you can swap this for `"ts-loader": "^10.0.0"`.
- `tsconfig.json` uses `"module": "preserve"` and `"moduleResolution": "bundler"`, the recommended settings when a bundler handles module resolution.
- `webpack.config.js` only sets what differs from webpack's defaults: the `.ts` entry, the `ts-loader` rule, and `.ts` in `resolve.extensions` so imports like `./greet` resolve.
