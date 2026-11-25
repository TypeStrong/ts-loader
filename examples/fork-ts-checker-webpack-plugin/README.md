# TypeScript 7 + ts-loader + fork-ts-checker-webpack-plugin

A webpack 5 setup where `ts-loader` v10 only transpiles, and [fork-ts-checker-webpack-plugin](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin) v10 type checks in a separate process. Both use TypeScript 7 (the native, `tsgo`-powered compiler).

```shell
npm install

# Start the dev server (http://localhost:8080)
npm start

# Production build to ./dist
npm run build
```

Notes:

- This uses the `ts-loader` v10 beta, the `fork-ts-checker-webpack-plugin` v10 alpha and the TypeScript 7.1 beta. Once they have stable releases, swap them for `"ts-loader": "^10.0.0"`, `"fork-ts-checker-webpack-plugin": "^10.0.0"` and `"typescript": "^7.1.0"`.
- `webpack.config.js` differs from [examples/simple](../simple/) in two ways: `ts-loader` has `transpileOnly: true`, and `ForkTsCheckerWebpackPlugin` is in `plugins`.
- Type errors are reported by the plugin. A production build fails on them. The dev server shows them after the bundle is ready, so a rebuild doesn't wait for the type check.
- To see it work, change `name: 'TypeScript 7'` to `name: 7` in `src/index.ts`.
