# TypeScript loader for webpack

[![npm version](https://img.shields.io/npm/v/ts-loader.svg)](https://www.npmjs.com/package/ts-loader)
[![build and test](https://github.com/TypeStrong/ts-loader/actions/workflows/ci.yml/badge.svg)](https://github.com/TypeStrong/ts-loader/actions/workflows/ci.yml)
[![Downloads](https://img.shields.io/npm/dm/ts-loader.svg)](https://npmjs.org/package/ts-loader)
[![node version](https://img.shields.io/node/v/ts-loader.svg)](https://www.npmjs.com/package/ts-loader)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

<br />
<p align="center">
  <h3 align="center">ts-loader</h3>

  <p align="center">
    This is the TypeScript loader for webpack.
    <br />
    <br />
    <a href="https://github.com/TypeStrong/ts-loader#installation">Installation</a>
    ·
    <a href="https://github.com/TypeStrong/ts-loader/issues">Report Bug</a>
    ·
    <a href="https://github.com/TypeStrong/ts-loader/issues">Request Feature</a>
  </p>
</p>

## Table of Contents

<!-- toc -->

- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Upgrading to v10](#upgrading-to-v10)
  - [Running](#running)
  - [Examples](#examples)
  - [Faster Builds](#faster-builds)
  - [Yarn Plug’n’Play](#yarn-plugnplay)
  - [Babel](#babel)
  - [Compatibility](#compatibility)
  - [Configuration](#configuration)
    - [`devtool` / sourcemaps](#devtool--sourcemaps)
  - [Code Splitting and Loading Other Resources](#code-splitting-and-loading-other-resources)
  - [Declarations (.d.ts)](#declaration-files-dts)
  - [Failing the build on TypeScript compilation error](#failing-the-build-on-typescript-compilation-error)
  - [`paths` module resolution](#paths-module-resolution)
  - [Options](#options)
  - [Loader Options](#loader-options)
    - [transpileOnly](#transpileonly)
    - [resolveModuleName and resolveTypeReferenceDirective](#resolvemodulename-and-resolvetypereferencedirective)
    - [getCustomTransformers](#getcustomtransformers)
    - [logInfoToStdOut](#loginfotostdout)
    - [logLevel](#loglevel)
    - [silent](#silent)
    - [ignoreDiagnostics](#ignorediagnostics)
    - [reportFiles](#reportfiles)
    - [configFile](#configfile)
    - [compiler](#compiler)
    - [colors](#colors)
    - [errorFormatter](#errorformatter)
    - [instance](#instance)
    - [appendTsSuffixTo](#appendtssuffixto)
    - [appendTsxSuffixTo](#appendtsxsuffixto)
    - [useCaseSensitiveFileNames](#usecasesensitivefilenames)
    - [allowTsInNodeModules](#allowtsinnodemodules)
    - [projectReferences](#projectreferences)
  - [Usage with webpack watch](#usage-with-webpack-watch)
  - [Hot Module replacement](#hot-module-replacement)
- [Contributing](#contributing)
- [History](#history)
- [License](#license)

<!-- tocstop -->

## Getting Started

### Installation

```
yarn add ts-loader --dev
```

or

```
npm install ts-loader --save-dev
```

You will also need to install TypeScript 7.1+ if you have not already. `ts-loader` compiles through TypeScript's native `typescript/sync` API, which older versions of TypeScript do not provide. Until TypeScript 7.1 has a stable release, install the `next` prerelease:

```
yarn add typescript@next --dev
```

or

```
npm install typescript@next --save-dev
```

### Upgrading to v10

v10 is a rewrite of `ts-loader` on top of TypeScript's native (`tsgo`-powered) API. Before upgrading, note that:

- TypeScript 7.1+ and Node.js 22+ are required.
- The `compilerOptions`, `context`, `happyPackMode`, `onlyCompileBundledFiles`, `experimentalWatchApi` and `experimentalFileCaching` loader options have been removed. Supplying any of them fails the build with an "unexpected loader option" error. Set compiler options in your `tsconfig.json` instead.
- `getCustomTransformers`, `resolveModuleName` and `resolveTypeReferenceDirective` are still accepted but currently have no effect, and `projectReferences` is not yet supported.
- The [`compiler`](#compiler) option must resolve to a package that exposes a `<compiler>/sync` entry point.
- `errorFormatter`'s `colors` argument is now a small `picocolors`-backed helper rather than a `chalk` instance.

See the [changelog](CHANGELOG.md) for full details.

### Running

Use webpack like normal, including `webpack --watch` and `webpack-dev-server`, or through another
build system using the [Node.js API](https://webpack.js.org/api/node/).

### Examples

We have a number of example setups to accommodate different workflows. Our examples can be found [here](examples/).

> **Note:** The examples have not yet been updated for v10 and still use `ts-loader` v9 or earlier with older versions of TypeScript.

We probably have more examples than we need. That said, here's a good way to get started:

- I want the simplest setup going. Use "[vanilla](examples/vanilla)" `ts-loader`
- I want the fastest compilation that's available. Use [fork-ts-checker-webpack-plugin](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin). It performs type checking in a separate process with `ts-loader` just handling transpilation.

### Faster Builds

As your project becomes bigger, compilation time increases linearly. It's because typescript's semantic checker has to inspect all files on every rebuild.
The simple solution is to disable it by using the `transpileOnly: true` option, but doing so leaves you without type checking and _will not output declaration files_.

You probably don't want to give up type checking; that's rather the point of TypeScript. So what you can do is use the [fork-ts-checker-webpack-plugin](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin).
It runs the type checker on a separate process, so your build remains fast thanks to `transpileOnly: true` but you still have the type checking.

If you'd like to see a simple setup take a look at [our example](examples/fork-ts-checker-webpack-plugin/).

> **Note:** fork-ts-checker-webpack-plugin may not support TypeScript 7 yet. Check its documentation before relying on it with `ts-loader` v10.

### Yarn Plug’n’Play

> **Note:** Yarn Plug’n’Play integration is not currently supported in v10. The [pnp-webpack-plugin](https://github.com/arcanis/pnp-webpack-plugin#ts-loader-integration) integration relies on the [`resolveModuleName`](#resolvemodulename-and-resolvetypereferencedirective) option, which TypeScript's native API does not currently support.

`ts-loader` v9 and earlier support [Yarn Plug’n’Play](https://yarnpkg.com/en/docs/pnp). The recommended way to integrate is using the [pnp-webpack-plugin](https://github.com/arcanis/pnp-webpack-plugin#ts-loader-integration).

### Babel

`ts-loader` works very well in combination with [babel](https://babeljs.io/) and [babel-loader](https://github.com/babel/babel-loader). Chain them so that `ts-loader` runs first, for example `use: ['babel-loader', 'ts-loader']` (webpack applies loaders from right to left).

### Compatibility

- TypeScript: 7.1+
- webpack: 4.x+ and 5.x+
- node: 22.x+

A full test suite runs on each pull request. It runs on Linux, macOS and Windows, testing `ts-loader` against a pinned TypeScript 7.1 build and against TypeScript@next, on Node.js 22, 24 and 26. Comparison tests run against webpack 5 only; execution tests run against both webpack 4 and webpack 5.

If you become aware of issues not caught by the test suite then please let us know. Better yet, write a test and submit it in a PR!

### Configuration

1. Create or update `webpack.config.js` like so:

   ```javascript
   module.exports = {
     mode: 'development',
     devtool: 'inline-source-map',
     entry: './app.ts',
     output: {
       filename: 'bundle.js',
     },
     resolve: {
       // Add `.ts` and `.tsx` as a resolvable extension.
       extensions: ['.ts', '.tsx', '.js'],
       // Add support for TypeScripts fully qualified ESM imports.
       extensionAlias: {
         '.js': ['.js', '.ts'],
         '.cjs': ['.cjs', '.cts'],
         '.mjs': ['.mjs', '.mts'],
       },
     },
     module: {
       rules: [
         // all files with a `.ts`, `.cts`, `.mts` or `.tsx` extension will be handled by `ts-loader`
         { test: /\.([cm]?ts|tsx)$/, loader: 'ts-loader' },
       ],
     },
   };
   ```

2. Add a [`tsconfig.json`](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html) file. (The one below is super simple; but you can tweak this to your hearts desire)

   ```json
   {
     "compilerOptions": {
       "sourceMap": true
     }
   }
   ```

The [tsconfig.json](http://www.typescriptlang.org/docs/handbook/tsconfig-json.html) file controls
TypeScript-related options so that your IDE, the `tsc` command, and this loader all share the
same options.

#### `devtool` / sourcemaps

If you want to be able to debug your original source then you can thanks to the magic of sourcemaps. There are 2 steps to getting this set up with `ts-loader` and webpack.

First, for `ts-loader` to produce **sourcemaps**, you will need to set the [tsconfig.json](http://www.typescriptlang.org/docs/handbook/tsconfig-json.html) option as `"sourceMap": true`.

Second, you need to set the `devtool` option in your `webpack.config.js` to support the type of sourcemaps you want. To make your choice have a read of the [`devtool` webpack docs](https://webpack.js.org/configuration/devtool/). You may be somewhat daunted by the choice available. You may also want to vary the sourcemap strategy depending on your build environment. Here are some example strategies for different environments:

- `devtool: 'inline-source-map'` - Solid sourcemap support; the best "all-rounder". Works well with karma-webpack (not all strategies do)
- `devtool: 'eval-cheap-module-source-map'` - Best support for sourcemaps whilst debugging.
- `devtool: 'source-map'` - Separate, full sourcemap files that work with minifiers; typically you might use this in Production

### Code Splitting and Loading Other Resources

Loading css and other resources is possible but you will need to make sure that
you have defined the `require` function in a [declaration file](https://www.typescriptlang.org/docs/handbook/writing-declaration-files.html).

```typescript
declare var require: {
  <T>(path: string): T;
  (paths: string[], callback: (...modules: any[]) => void): void;
  ensure: (
    paths: string[],
    callback: (require: <T>(path: string) => T) => void,
  ) => void;
};
```

Then you can simply require assets or chunks per the [webpack documentation](https://webpack.js.org/guides/code-splitting/).

```javascript
require('!style!css!./style.css');
```

The same basic process is required for code splitting. In this case, you `import` modules you need but you
don't directly use them. Instead you require them at [split points](https://webpack.js.org/guides/code-splitting/). See [this example](test/comparison-tests/codeSplitting) and [this example](test/comparison-tests/es6codeSplitting) for more details.

TypeScript also supports ECMAScript's `import()` calls, which import a module and return a promise to that module. webpack treats these as split points too - details on usage can be found [here](https://webpack.js.org/guides/code-splitting/#dynamic-imports). Happy code splitting!

### Declaration Files (.d.ts)

To output declaration files (.d.ts), you can set "declaration": true in your tsconfig and set "transpileOnly" to false.

If you use ts-loader with "transpileOnly": true along with [fork-ts-checker-webpack-plugin](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin), you will need to configure fork-ts-checker-webpack-plugin to output definition files, you can learn more on the plugin's documentation page: https://github.com/TypeStrong/fork-ts-checker-webpack-plugin#typescript-options

To output a built .d.ts file, you can use the [DeclarationBundlerPlugin](https://www.npmjs.com/package/types-webpack-bundler) in your webpack config.

### Failing the build on TypeScript compilation error

The build **should** fail on TypeScript compilation errors. If it does not, check that you are not running webpack with an option that ignores errors, and that you have not filtered TypeScript errors out with [`ignoreDiagnostics`](#ignorediagnostics) or [`reportFiles`](#reportfiles).

For more background have a read of [this issue](https://github.com/TypeStrong/ts-loader/issues/108).

### `paths` module resolution

TypeScript's [`paths`](https://www.typescriptlang.org/tsconfig/#paths) option lets you import modules through aliases such as `@app/utils`. TypeScript does not rewrite those import specifiers in its output, so webpack also needs to know how to resolve them.

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

If you are using webpack 5.105 or later, webpack can read `paths` from your `tsconfig.json` itself using the [`resolve.tsconfig`](https://webpack.js.org/configuration/resolve/#resolvetsconfig) option:

```javascript
module.exports = {
  ...
  resolve: {
    tsconfig: true, // or a path, e.g. './path/to/tsconfig.json'
  }
  ...
}
```

For webpack 4 or earlier versions of webpack 5, use the [tsconfig-paths-webpack-plugin](https://www.npmjs.com/package/tsconfig-paths-webpack-plugin) package (v4 or later, which supports `paths` without `baseUrl`). Use the config below or check the [package](https://github.com/dividab/tsconfig-paths-webpack-plugin/blob/master/README.md) for more information on usage.

```javascript
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
  ...
  resolve: {
    plugins: [new TsconfigPathsPlugin({ configFile: "./path/to/tsconfig.json" })]
  }
  ...
}
```

### Options

There are two types of options: TypeScript options (aka "compiler options") and loader options. TypeScript options should be set using a tsconfig.json file. Loader options can be specified through the `options` property in the webpack configuration:

```javascript
module.exports = {
  ...
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true
            }
          }
        ]
      }
    ]
  }
}
```

### Loader Options

#### transpileOnly

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `false`       |

If you want to speed up compilation significantly you can set this flag.
However, many of the benefits you get from static type checking between different dependencies in your application will be lost.

It's advisable to use `transpileOnly` alongside the [fork-ts-checker-webpack-plugin](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin) to get full type checking again. To see what this looks like in practice then either take a look at [our example](examples/fork-ts-checker-webpack-plugin). (Note that fork-ts-checker-webpack-plugin may not support TypeScript 7 yet - see [Faster Builds](#faster-builds).)

> Tip: When you add the [fork-ts-checker-webpack-plugin](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin) to your webpack config, the `transpileOnly` will default to `true`, so you can skip that option.

If you enable this option, webpack 4 will give you "export not found" warnings any time you re-export a type:

```
WARNING in ./src/bar.ts
1:0-34 "export 'IFoo' was not found in './foo'
 @ ./src/bar.ts
 @ ./src/index.ts
```

The reason this happens is that when typescript doesn't do a full type check, it does not have enough information to determine whether an imported name is a type or not, so when the name is then exported, typescript has no choice but to emit the export. Fortunately, the extraneous export should not be harmful, so you can just suppress these warnings:

```javascript
module.exports = {
  ...
  stats: {
    warningsFilter: /export .* was not found in/
  }
}
```

#### resolveModuleName and resolveTypeReferenceDirective

> **Note:** These options are accepted for backwards compatibility but currently have no effect. TypeScript's native API does not expose a custom module resolution hook. If it gains one, these options will work again; if it never does, they will be removed.

These options should be functions which will be used to resolve the import statements and the `<reference types="...">` directives instead of the default TypeScript implementation. It's not intended that these will typically be used by a user of `ts-loader` - they exist to facilitate functionality such as [Yarn Plug’n’Play](https://yarnpkg.com/en/docs/pnp).

#### getCustomTransformers

| Type                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(program: Program, getProgram: () => Program) => { before?: TransformerFactory<SourceFile>[]; after?: TransformerFactory<SourceFile>[]; afterDeclarations?: TransformerFactory<SourceFile>[]; }` |

> **Note:** This option is accepted for backwards compatibility but currently has no effect. TypeScript's native API does not expose custom transformers. If it gains support, this option will work again; if it never does, it will be removed.

Provide custom transformers. For example usage take a look at [typescript-plugin-styled-components](https://github.com/Igorbek/typescript-plugin-styled-components) or our [test](test/comparison-tests/customTransformer).

#### logInfoToStdOut

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `false`       |

This is important if you read from stdout or stderr and for proper error handling.
The default value ensures that you can read from stdout e.g. via pipes or you use webpack -j to generate json output.

#### logLevel

| Type     | Default Value |
| -------- | ------------- |
| `string` | `warn`        |

Can be `info`, `warn` or `error` which limits the log output to the specified log level.
Beware of the fact that errors are always written to stderr, and everything else is written to stderr too unless `logInfoToStdOut` is true, in which case it goes to stdout.

#### silent

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `false`       |

If `true`, no console.log messages will be emitted. Note that most error
messages are emitted via webpack which is not affected by this flag.

#### ignoreDiagnostics

| Type       | Default Value |
| ---------- | ------------- |
| `number[]` | `[]`          |

You can squelch certain TypeScript errors by specifying an array of diagnostic
codes to ignore.

#### reportFiles

| Type       | Default Value |
| ---------- | ------------- |
| `string[]` | `[]`          |

Only report errors on files matching these glob patterns.

```javascript
  // in webpack.config.js
  {
    test: /\.ts$/,
    loader: 'ts-loader',
    options: { reportFiles: ['src/**/*.{ts,tsx}', '!src/skip.ts'] }
  }
```

This can be useful when certain types definitions have errors that are not fatal to your application.

#### configFile

| Type     | Default Value     |
| -------- | ----------------- |
| `string` | `'tsconfig.json'` |

Allows you to specify where to find the TypeScript configuration file.

You may provide

- just a file name. The loader then will search for the config file of each entry point in the respective entry point's containing folder. If a config file cannot be found there, it will travel up the parent directory chain and look for the config file in those folders.
- a relative path to the configuration file. It will be resolved relative to the respective `.ts` entry file.
- an absolute path to the configuration file.

#### compiler

| Type     | Default Value  |
| -------- | -------------- |
| `string` | `'typescript'` |

Allows you to use a TypeScript package other than the one installed as `typescript`, such as a fork or a specific prerelease installed under an alias.

The package must expose TypeScript's native API at a `<compiler>/sync` entry point (for example `typescript/sync`). Packages that only provide the classic compiler API, such as `ttypescript`, are not supported.

#### colors

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `true`        |

If `false`, disables built-in colors in logger messages.

#### errorFormatter

| Type                                              | Default Value |
| ------------------------------------------------- | ------------- |
| `(message: ErrorInfo, colors: boolean) => string` | `undefined`   |

By default `ts-loader` formats TypeScript compiler output for an error or a warning in the style:

```
[tsl] ERROR in myFile.ts(3,14)
      TS4711: you did something very wrong
```

If that format is not to your taste you can supply your own formatter using the `errorFormatter` option. Below is a template for a custom error formatter. Please note that the `colors` parameter is a small [`picocolors`](https://github.com/alexeyraspopov/picocolors)-backed helper object which you can use to color your output. (It will respect the `colors` option.)

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

If the above formatter received an error like this:

```json
{
  "code": 2307,
  "severity": "error",
  "content": "Cannot find module 'components/myComponent2'.",
  "file": "/.test/errorFormatter/app.ts",
  "line": 2,
  "character": 31
}
```

It would produce an error message that said:

```
Does not compute.... code: 2307,severity: error,content: Cannot find module 'components/myComponent2'.,file: /.test/errorFormatter/app.ts,line: 2,character: 31
```

And the bit after "Does not compute.... " would be red.

#### instance

| Type     | Default Value                     |
| -------- | --------------------------------- |
| `string` | derived from the loader's options |

Advanced option to force files to go through different instances of the
TypeScript compiler. Can be used to force segregation between different parts
of your code. If not set, rules with identical loader options share an
instance and rules with different options get separate ones.

#### appendTsSuffixTo

| Type                   | Default Value |
| ---------------------- | ------------- |
| `(RegExp \| string)[]` | `[]`          |

#### appendTsxSuffixTo

| Type                   | Default Value |
| ---------------------- | ------------- |
| `(RegExp \| string)[]` | `[]`          |

A list of regular expressions to be matched against filename. If filename matches one of the regular expressions, a `.ts` or `.tsx` suffix will be appended to that filename.

```js
// change this:
{
  appendTsSuffixTo: [/\.vue$/];
}
// to:
{
  appendTsSuffixTo: ['\\.vue$'];
}
```

This is useful for `*.vue` [file format](https://vuejs.org/v2/guide/single-file-components.html) for now. (Probably will benefit from the new single file format in the future.)

Example:

webpack.config.js:

```javascript
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
};
```

index.vue

```vue
<template>
  <p>hello {{ msg }}</p>
</template>
<script lang="ts">
export default {
  data(): Object {
    return {
      msg: 'world',
    };
  },
};
</script>
```

We can handle `.tsx` by quite similar way:

webpack.config.js:

```javascript
module.exports = {
  entry: './index.vue',
  output: { filename: 'bundle.js' },
  resolve: {
    extensions: ['.ts', '.tsx', '.vue', '.vuex'],
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        loader: 'vue-loader',
        options: {
          loaders: {
            ts: 'ts-loader',
            tsx: 'babel-loader!ts-loader',
          },
        },
      },
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: { appendTsSuffixTo: [/TS\.vue$/] },
      },
      {
        test: /\.tsx$/,
        loader: 'babel-loader!ts-loader',
        options: { appendTsxSuffixTo: [/TSX\.vue$/] },
      },
    ],
  },
};
```

tsconfig.json (set `jsx` option to `preserve` to let babel handle jsx)

```json
{
  "compilerOptions": {
    "jsx": "preserve"
  }
}
```

index.vue

```vue
<script lang="tsx">
export default {
  functional: true,
  render(h, c) {
    return <div>Content</div>;
  },
};
</script>
```

Or if you want to use only tsx, just use the `appendTsxSuffixTo` option only:

```javascript
            { test: /\.ts$/, loader: 'ts-loader' },
            { test: /\.tsx$/, loader: 'babel-loader!ts-loader', options: { appendTsxSuffixTo: [/\.vue$/] } }
```

#### useCaseSensitiveFileNames

| Type      | Default Value                              |
| --------- | ------------------------------------------ |
| `boolean` | `false` on Windows, `true` everywhere else |

Controls whether `ts-loader` treats file paths as case-sensitive when it tracks the files it compiles. By default paths are treated as case-insensitive on Windows and case-sensitive on every other platform, including macOS. If you are on a case-insensitive filesystem other than Windows (for example the macOS default) and import the same file using different casing, set this to `false`. Setting it to `true` can have some performance benefits, because it simplifies the file resolution code path.

#### allowTsInNodeModules

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `false`       |

By default, `ts-loader` will not compile `.ts` files in `node_modules`.
You should not need to recompile `.ts` files there, but if you really want to, use this option.
Note that this option acts as a _whitelist_ - any modules you desire to import must be included in
the `"files"` or `"include"` block of your project's `tsconfig.json`.

See: [https://github.com/Microsoft/TypeScript/issues/12358](https://github.com/Microsoft/TypeScript/issues/12358)

```javascript
  // in webpack.config.js
  {
    test: /\.ts$/,
    loader: 'ts-loader',
    options: { allowTsInNodeModules: true }
  }
```

And in your `tsconfig.json`:

```json
{
  "include": ["node_modules/whitelisted_module.ts"],
  "files": ["node_modules/my_module/whitelisted_file.ts"]
}
```

#### projectReferences

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `false`       |

> **Note:** Project references are not yet supported in v10, which is built on TypeScript's native API. The option is still accepted, but the rest of this section describes v9 behaviour. Support will be added once the native API makes it possible.

ts-loader has opt-in support for [project references](https://www.typescriptlang.org/docs/handbook/project-references.html). With this configuration option enabled, `ts-loader` will incrementally rebuild upstream projects the same way `tsc --build` does. Otherwise, source files in referenced projects will be treated as if they’re part of the root project.

In order to make use of this option your project needs to be correctly configured to build the project references and then to use them as part of the build. See the [Project References Guide](REFERENCES.md) and the example code in the examples which can be found [here](examples/project-references-example/).

### Usage with webpack watch

Because TS will generate .js and .d.ts files, you should ignore these files, otherwise watchers may go into an infinite watch loop. For example, when using webpack, you may wish to add this to your webpack.conf.js file:

```javascript
// for webpack 4
 plugins: [
   new webpack.WatchIgnorePlugin([
     /\.js$/,
     /\.d\.[cm]?ts$/
   ])
 ],

// for webpack 5
plugins: [
  new webpack.WatchIgnorePlugin({
    paths:[
      /\.js$/,
      /\.d\.[cm]?ts$/
  ]})
],
```

It's worth noting that use of the `LoaderOptionsPlugin` is [only supposed to be a stopgap measure](https://webpack.js.org/plugins/loader-options-plugin/). You may want to look at removing it entirely.

### Hot Module replacement

We do not support HMR as we did not yet work out a reliable way how to set it up.

If you want to give `webpack-dev-server` HMR a try, follow the official [webpack HMR guide](https://webpack.js.org/guides/hot-module-replacement/), then tweak a few config options for `ts-loader`:

1. Set `transpileOnly` to `true` (see [transpileOnly](#transpileonly) for config details and recommendations above).
2. Inside your HMR acceptance callback function, maybe re-require the module that was replaced.

## Contributing

This is your TypeScript loader! We want you to help make it even better. Please feel free to contribute; see the [contributor's guide](CONTRIBUTING.md) to get started.

## History

`ts-loader` was started by [James Brantly](https://github.com/jbrantly), since 2016 [John Reilly](https://github.com/johnnyreilly) has been taking good care of it. If you're interested, you can [read more about how that came to pass](https://johnnyreilly.com/but-you-cant-die-i-love-you-ts-loader).

## License

MIT License
