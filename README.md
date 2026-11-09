# `ts-loader` - TypeScript loader for webpack

[![npm version](https://img.shields.io/npm/v/ts-loader.svg)](https://www.npmjs.com/package/ts-loader)
[![ci](https://github.com/TypeStrong/ts-loader/actions/workflows/ci.yml/badge.svg)](https://github.com/TypeStrong/ts-loader/actions/workflows/ci.yml)
[![Downloads](https://img.shields.io/npm/dm/ts-loader.svg)](https://npmjs.org/package/ts-loader)
[![node version](https://img.shields.io/node/v/ts-loader.svg)](https://www.npmjs.com/package/ts-loader)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

`ts-loader` lets webpack compile your TypeScript files. It type checks your code and reports TypeScript errors as part of your webpack build.

This README covers **v10**, which is in beta. v10 uses TypeScript 7's native compiler API. If you are on TypeScript 6 or earlier, use v9 (`npm install ts-loader --save-dev`) and see the [v9 README](https://github.com/TypeStrong/ts-loader/tree/main#readme).

## Getting started

### 1. Install

```
npm install --save-dev ts-loader@next typescript@beta
```

or

```
pnpm add --save-dev ts-loader@next typescript@beta
```

`ts-loader` v10 needs TypeScript 7.1 or later. Until TypeScript 7.1 and `ts-loader` v10 have stable releases, install them from the `beta` and `next` tags as above.

### 2. Configure webpack

Create or update `webpack.config.js`:

```javascript
import HtmlWebpackPlugin from 'html-webpack-plugin';

/** @type {import('webpack').Configuration} */
export default {
  entry: './src/index.ts',
  module: {
    rules: [{ test: /\.ts$/, loader: 'ts-loader' }],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '...'],
  },
  plugins: [new HtmlWebpackPlugin()],
};
```

This writes the bundle to `dist/main.js` and makes `dist/index.html` that references it. If you use `.mts` or `.cts` files, or write imports with a `.js` extension, see [ESM-style imports](#esm-style-imports).

### 3. Add a `tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

[`tsconfig.json`](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html) holds your TypeScript options, so your editor, the `tsc` command and `ts-loader` all use the same settings.

### 4. Run webpack

Run webpack as usual: `webpack`, `webpack --watch`, `webpack-dev-server`, or the [Node.js API](https://webpack.js.org/api/node/). If your code has a TypeScript error, webpack reports it and the build fails.

For a complete working setup, see [examples/simple](examples/simple/).

## Compatibility

- TypeScript: 7.1+
- webpack: 4.x and 5.x
- Node.js: 22+

The test suite runs on every pull request on Linux, macOS and Windows, against TypeScript 7.1 and TypeScript@next, on Node.js 22, 24 and 26. If you find a problem the tests don't catch, please [open an issue](https://github.com/TypeStrong/ts-loader/issues), or better yet, send a PR with a test.

## Guides

### Faster builds

Type checking takes longer as your project grows, because TypeScript checks every file on each rebuild. Setting the [`transpileOnly`](#transpileonly) option to `true` skips type checking, which makes builds much faster, but you lose type errors (and declaration files, unless you use [`isolatedDeclarations`](#declaration-files-dts)).

To get both speed and type checking, use `transpileOnly: true` together with [fork-ts-checker-webpack-plugin](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin), which type checks in a separate process.

> **Note:** fork-ts-checker-webpack-plugin may not support TypeScript 7 yet. Check its documentation before relying on it with `ts-loader` v10.

### Sourcemaps

To debug your original TypeScript in the browser:

1. Set `"sourceMap": true` in your `tsconfig.json`.
2. Set webpack's [`devtool`](https://webpack.js.org/configuration/devtool/) option. Some good choices:
   - `'inline-source-map'` - a good all-rounder; works well with karma-webpack.
   - `'eval-cheap-module-source-map'` - fast rebuilds while developing.
   - `'source-map'` - separate sourcemap files, typically for production.

### Using with Babel

`ts-loader` works well with [babel-loader](https://github.com/babel/babel-loader). Chain them so that `ts-loader` runs first: `use: ['babel-loader', 'ts-loader']` (webpack applies loaders from right to left).

### ESM-style imports

If you write imports the way Node.js ESM needs them, with a `.js` extension (`import { foo } from './foo.js'` for a file called `foo.ts`), tell webpack to look for the TypeScript file too. If you use `.mts` or `.cts` files, also widen the rule's `test` so they reach `ts-loader`:

```javascript
import HtmlWebpackPlugin from 'html-webpack-plugin';

/** @type {import('webpack').Configuration} */
export default {
  entry: './src/index.ts',
  module: {
    rules: [{ test: /\.ts$/, loader: 'ts-loader' }],
  },
  resolve: {
    extensions: ['.ts', '...'],
  },
  plugins: [new HtmlWebpackPlugin()],
};
```

### `paths` module resolution

TypeScript's [`paths`](https://www.typescriptlang.org/tsconfig/#paths) option lets you import modules through aliases such as `@app/utils`. TypeScript doesn't rewrite these imports in its output, so webpack also needs to know how to resolve them.

TypeScript 7 removed the `baseUrl` option, so each `paths` entry must be relative to the `tsconfig.json` it is declared in:

```json
{
  "compilerOptions": {
    "paths": {
      "@app/*": ["./src/app/*"],
      "@lib/*": ["./src/lib/*"]
    }
  }
}
```

With webpack 5.105 or later, webpack can read `paths` from your `tsconfig.json` using [`resolve.tsconfig`](https://webpack.js.org/configuration/resolve/#resolvetsconfig):

```javascript
module.exports = {
  // ...
  resolve: {
    tsconfig: true, // or a path, e.g. './path/to/tsconfig.json'
  },
};
```

With webpack 4 or older versions of webpack 5, use [tsconfig-paths-webpack-plugin](https://www.npmjs.com/package/tsconfig-paths-webpack-plugin) v4 or later:

```javascript
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
  // ...
  resolve: {
    plugins: [
      new TsconfigPathsPlugin({ configFile: './path/to/tsconfig.json' }),
    ],
  },
};
```

### Declaration files (.d.ts)

To output declaration files, set `"declaration": true` in your `tsconfig.json`.

- With `transpileOnly: false` (the default), they are emitted from the type-checked program.
- With `transpileOnly: true`, they are only emitted if you also set [`"isolatedDeclarations": true`](https://www.typescriptlang.org/tsconfig/#isolatedDeclarations). If you use fork-ts-checker-webpack-plugin, you can [configure it](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin#typescript-options) to output declaration files instead.

To bundle them into a single .d.ts file, you can use [DeclarationBundlerPlugin](https://www.npmjs.com/package/types-webpack-bundler).

### Code splitting and importing other files

Dynamic `import()` calls work as webpack [split points](https://webpack.js.org/guides/code-splitting/#dynamic-imports), so you can code split without any extra setup.

To import non-TypeScript files such as CSS, TypeScript needs a declaration for them. For example, add this to a `.d.ts` file in your project:

```typescript
declare module '*.css';
```

### Watch mode

If TypeScript writes `.js` or `.d.ts` files into folders webpack is watching, webpack can rebuild in an endless loop. Tell webpack to ignore them:

```javascript
// webpack 5
plugins: [
  new webpack.WatchIgnorePlugin({ paths: [/\.js$/, /\.d\.[cm]?ts$/] }),
],

// webpack 4
plugins: [
  new webpack.WatchIgnorePlugin([/\.js$/, /\.d\.[cm]?ts$/]),
],
```

### Hot Module Replacement

`ts-loader` doesn't officially support HMR. If you want to try it with `webpack-dev-server`, follow the [webpack HMR guide](https://webpack.js.org/guides/hot-module-replacement/), set [`transpileOnly`](#transpileonly) to `true`, and re-require the replaced module inside your HMR accept callback.

### The build doesn't fail on type errors

It should. If it doesn't, check that you aren't running webpack with an option that ignores errors, and that you haven't filtered the errors out with [`ignoreDiagnostics`](#ignorediagnostics) or [`reportFiles`](#reportfiles). See [this issue](https://github.com/TypeStrong/ts-loader/issues/108) for more background.

## Loader options

Most projects don't need any. TypeScript options belong in `tsconfig.json`; `ts-loader`'s own options go in the `options` property of the webpack rule:

```javascript
module.exports = {
  // ...
  module: {
    rules: [
      {
        test: /\.([cm]?ts|tsx)$/,
        loader: 'ts-loader',
        options: {
          transpileOnly: true,
        },
      },
    ],
  },
};
```

#### transpileOnly

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `false`       |

Skips type checking, which makes compilation much faster. You lose type errors, so consider pairing it with fork-ts-checker-webpack-plugin (see [Faster builds](#faster-builds)). When you add fork-ts-checker-webpack-plugin to your webpack config, `transpileOnly` defaults to `true`.

With webpack 4, this option causes "export not found" warnings when you re-export a type:

```
WARNING in ./src/bar.ts
1:0-34 "export 'IFoo' was not found in './foo'
```

Without a full type check, TypeScript can't tell whether an imported name is a type, so it keeps the export. The extra export is harmless, so you can hide these warnings:

```javascript
module.exports = {
  // ...
  stats: {
    warningsFilter: /export .* was not found in/,
  },
};
```

#### configFile

| Type     | Default Value     |
| -------- | ----------------- |
| `string` | `'tsconfig.json'` |

Where to find your TypeScript config. This can be:

- a file name. `ts-loader` looks for it in the entry file's folder, then in each parent folder.
- a relative path, resolved relative to the entry file.
- an absolute path.

#### ignoreDiagnostics

| Type       | Default Value |
| ---------- | ------------- |
| `number[]` | `[]`          |

TypeScript error codes to ignore, e.g. `[2307]`.

#### reportFiles

| Type       | Default Value |
| ---------- | ------------- |
| `string[]` | `[]`          |

Only report errors in files matching these glob patterns. Useful when some type definitions have errors that don't affect your app.

```javascript
options: {
  reportFiles: ['src/**/*.{ts,tsx}', '!src/skip.ts'];
}
```

#### appendTsSuffixTo / appendTsxSuffixTo

| Type                   | Default Value |
| ---------------------- | ------------- |
| `(RegExp \| string)[]` | `[]`          |

Patterns (regular expressions, or strings treated as regular expressions) matched against each file name. When a file name matches, `.ts` (or `.tsx`) is appended to it, so TypeScript treats the file as TypeScript whatever its extension.

This is useful for single-file components such as [Vue](https://vuejs.org/guide/scaling-up/sfc.html), whose `<script lang="ts">` blocks reach `ts-loader` under the `.vue` file name:

```javascript
const { VueLoaderPlugin } = require('vue-loader');

module.exports = {
  entry: './index.vue',
  output: { filename: 'bundle.js' },
  resolve: {
    extensions: ['.ts', '.vue'],
  },
  module: {
    rules: [
      { test: /\.vue$/, loader: 'vue-loader' },
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: { appendTsSuffixTo: [/\.vue$/] },
      },
    ],
  },
  plugins: [new VueLoaderPlugin()],
};
```

Use `appendTsxSuffixTo` the same way for `<script lang="tsx">` blocks, with a `.tsx` rule.

#### errorFormatter

| Type                                             | Default Value |
| ------------------------------------------------ | ------------- |
| `(message: ErrorInfo, colors: Colors) => string` | `undefined`   |

By default, `ts-loader` formats errors and warnings like this:

```
[tsl] ERROR in myFile.ts(3,14)
      TS4711: you did something very wrong
```

To use your own format, supply a function. `colors` is a small [`picocolors`](https://github.com/alexeyraspopov/picocolors)-backed helper that respects the [`colors`](#colors) option:

```javascript
function customErrorFormatter(error, colors) {
  const messageColor =
    error.severity === 'warning' ? colors.bold.yellow : colors.bold.red;
  return (
    'Does not compute.... ' +
    messageColor(Object.keys(error).map(key => `${key}: ${error[key]}`))
  );
}
```

The `error` object looks like this:

```json
{
  "code": 2307,
  "severity": "error",
  "content": "Cannot find module 'components/myComponent2' or its corresponding type declarations.",
  "file": "/path/to/project/app.ts",
  "line": 2,
  "character": 31,
  "context": "/path/to/project"
}
```

`file` is the absolute path of the file the error is in (empty if the error isn't tied to a file), and `context` is the folder of the module being compiled.

#### colors

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `true`        |

Set to `false` to turn off colors in `ts-loader`'s messages and in the errors and warnings it reports. Colors are also turned off automatically when the terminal doesn't support them.

#### logLevel

| Type     | Default Value |
| -------- | ------------- |
| `string` | `warn`        |

Can be `info`, `warn` or `error`. `ts-loader`'s only console output is a couple of info messages: which TypeScript API and `tsconfig.json` it is using, and a notice if the compiler process fails to shut down cleanly. `info` shows them; `warn` and `error` hide them. TypeScript errors and warnings aren't affected; they are always reported through webpack.

#### logInfoToStdOut

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `false`       |

Writes the info messages from [`logLevel`](#loglevel) to stdout instead of stderr. The default keeps stdout clean for webpack's own output, e.g. `webpack --json`.

#### silent

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `false`       |

If `true`, `ts-loader` writes nothing to the console. Errors reported through webpack are not affected.

#### compiler

| Type     | Default Value  |
| -------- | -------------- |
| `string` | `'typescript'` |

Use a TypeScript package other than the one installed as `typescript`, such as a fork or a prerelease installed under an alias. The package must provide TypeScript's native API at `<compiler>/sync` (for example `typescript/sync`). Packages that only provide the classic compiler API, such as `ttypescript`, are not supported.

#### instance

| Type     | Default Value                     |
| -------- | --------------------------------- |
| `string` | derived from the loader's options |

Advanced. Forces files through separate TypeScript compiler instances, to keep parts of your code apart. If not set, rules with identical loader options share an instance and rules with different options get separate ones.

#### useCaseSensitiveFileNames

| Type      | Default Value                                                                |
| --------- | ---------------------------------------------------------------------------- |
| `boolean` | detected from the filesystem your `tsconfig.json` is on (`false` on Windows) |

Whether file paths are case-sensitive. By default `ts-loader` checks the filesystem your `tsconfig.json` is on, as `tsc` does (so the default macOS volume is case-insensitive). Set this to override the detected value.

#### allowTsInNodeModules

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `false`       |

By default, `ts-loader` won't compile `.ts` files in `node_modules`. You shouldn't normally need to, but if you do, set this option. Every `.ts` file in `node_modules` that webpack sends to `ts-loader` is then compiled, whatever your `tsconfig.json`'s `files` or `include` say (unlike v9). To limit which packages are compiled, narrow the webpack rule with `include`:

```javascript
{
  test: /\.ts$/,
  include: [path.resolve(__dirname, 'src'), path.resolve(__dirname, 'node_modules/my_module')],
  loader: 'ts-loader',
  options: { allowTsInNodeModules: true },
}
```

See also: [microsoft/TypeScript#12358](https://github.com/Microsoft/TypeScript/issues/12358).

### Options with no effect in v10

These v9 options are still accepted so existing configs keep working, but they currently do nothing:

- **`resolveModuleName` and `resolveTypeReferenceDirective`** - custom module resolution functions (used for things like Yarn Plug'n'Play). TypeScript's native API has no custom module resolution hook yet.
- **`getCustomTransformers`** - custom TypeScript transformers. TypeScript's native API doesn't support custom transformers yet.
- **`projectReferences`** - in v10, TypeScript's native API follows [project references](https://www.typescriptlang.org/docs/handbook/project-references.html) in your `tsconfig.json` without this option. v10 does not build referenced projects to disk the way `tsc --build` does. For v9 behaviour, see the [Project References Guide](REFERENCES.md).

If TypeScript's native API adds support for these features, the options will work again; if it never does, they will be removed.

## Contributing

This is your TypeScript loader! We want you to help make it even better. Please feel free to contribute; see the [contributor's guide](CONTRIBUTING.md) to get started.

## History

`ts-loader` was started by [James Brantly](https://github.com/jbrantly), since 2016 [John Reilly](https://github.com/johnnyreilly) has been taking good care of it. If you're interested, you can [read more about how that came to pass](https://johnnyreilly.com/but-you-cant-die-i-love-you-ts-loader).

## License

MIT License
