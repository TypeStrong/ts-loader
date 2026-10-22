# TypeScript loader for webpack

[![npm version](https://img.shields.io/npm/v/ts-loader.svg)](https://www.npmjs.com/package/ts-loader)
[![ci](https://github.com/TypeStrong/ts-loader/actions/workflows/ci.yml/badge.svg)](https://github.com/TypeStrong/ts-loader/actions/workflows/ci.yml)
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
  - [Running](#running)
  - [Examples](#examples)
  - [Faster Builds](#faster-builds)
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

v10 is currently in beta and published under the `next` dist-tag; to try it, install `ts-loader@next` instead. The command above installs v9, which supports the classic TypeScript compiler API.

You will also need to install TypeScript 7.1+ if you have not already. `ts-loader` compiles through TypeScript's native `typescript/sync` API, which older versions of TypeScript do not provide. Until TypeScript 7.1 has a stable release, install the beta:

```
yarn add typescript@beta --dev
```

or

```
npm install typescript@beta --save-dev
```

### Running

Use webpack like normal, including `webpack --watch` and `webpack-dev-server`, or through another
build system using the [Node.js API](https://webpack.js.org/api/node/).

### Examples

For a minimal webpack 5 setup using `ts-loader` v10 with TypeScript 7, see [examples/simple](examples/simple/).

### Faster Builds

As your project becomes bigger, compilation time increases linearly. It's because typescript's semantic checker has to inspect all files on every rebuild.
The simple solution is to disable it by using the `transpileOnly: true` option, but doing so leaves you without type checking, and without declaration files unless your project uses [`isolatedDeclarations`](#declaration-files-dts).

You probably don't want to give up type checking; that's rather the point of TypeScript. So what you can do is use the [fork-ts-checker-webpack-plugin](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin).
It runs the type checker on a separate process, so your build remains fast thanks to `transpileOnly: true` but you still have the type checking.

> **Note:** fork-ts-checker-webpack-plugin may not support TypeScript 7 yet. Check its documentation before relying on it with `ts-loader` v10.

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

To output declaration files (.d.ts), set `"declaration": true` in your tsconfig. With `transpileOnly: false` (the default) they are emitted from the type-checked program. With `transpileOnly: true` they are only emitted if you also set [`"isolatedDeclarations": true`](https://www.typescriptlang.org/tsconfig/#isolatedDeclarations), which lets each file's declarations be generated without type-checking the whole project.

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

It's advisable to use `transpileOnly` alongside the [fork-ts-checker-webpack-plugin](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin) to get full type checking again. (Note that fork-ts-checker-webpack-plugin may not support TypeScript 7 yet - see [Faster Builds](#faster-builds).)

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

| Type                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `string \| ((program: Program, getProgram: () => Program) => { before?: TransformerFactory<SourceFile>[]; after?: TransformerFactory<SourceFile>[]; afterDeclarations?: TransformerFactory<SourceFile>[]; })` |

> **Note:** This option is accepted for backwards compatibility but currently has no effect. TypeScript's native API does not expose custom transformers. If it gains support, this option will work again; if it never does, it will be removed.

Provide custom transformers, either as a function or as the path to a module exporting one. For example usage take a look at [typescript-plugin-styled-components](https://github.com/Igorbek/typescript-plugin-styled-components) or our [test](test/comparison-tests/customTransformer).

#### logInfoToStdOut

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `false`       |

Writes `ts-loader`'s own info messages (see [`logLevel`](#loglevel)) to stdout instead of stderr. The default keeps stdout clean, so you can read webpack's own output from it, e.g. via pipes or `webpack --json`.

#### logLevel

| Type     | Default Value |
| -------- | ------------- |
| `string` | `warn`        |

Can be `info`, `warn` or `error`. `ts-loader`'s only console output is a couple of info messages (which TypeScript API and `tsconfig.json` it is using, and a notice if the compiler process fails to shut down cleanly): `info` shows them, while `warn` and `error` both hide them. They go to stderr unless [`logInfoToStdOut`](#loginfotostdout) is `true`.

TypeScript errors and warnings are not affected by this option - they are always reported through webpack.

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

If `false`, disables colors in `ts-loader`'s logger messages and in the TypeScript errors and warnings it reports (including the `colors` helper passed to a custom [`errorFormatter`](#errorformatter)). Colors are also disabled automatically when the terminal doesn't support them.

#### errorFormatter

| Type                                             | Default Value |
| ------------------------------------------------ | ------------- |
| `(message: ErrorInfo, colors: Colors) => string` | `undefined`   |

By default `ts-loader` formats TypeScript compiler output for an error or a warning in the style:

```
[tsl] ERROR in myFile.ts(3,14)
      TS4711: you did something very wrong
```

If that format is not to your taste you can supply your own formatter using the `errorFormatter` option. Below is a template for a custom error formatter. The `colors` parameter is a small [`picocolors`](https://github.com/alexeyraspopov/picocolors)-backed helper you can use to color your output; it respects the [`colors`](#colors) option.

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
  "content": "Cannot find module 'components/myComponent2' or its corresponding type declarations.",
  "file": "/path/to/project/app.ts",
  "line": 2,
  "character": 31,
  "context": "/path/to/project"
}
```

`file` is the absolute path of the file the diagnostic is in (empty for a diagnostic that isn't tied to a file), and `context` is the directory of the module being compiled.

It would produce an error message that said:

```
Does not compute.... code: 2307,severity: error,content: Cannot find module 'components/myComponent2' or its corresponding type declarations.,file: /path/to/project/app.ts,line: 2,character: 31,context: /path/to/project
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

Patterns (regular expressions, or strings that are treated as regular expressions) matched against each file name. If a file name matches one, a `.ts` or `.tsx` suffix is appended to it, so TypeScript treats the file as TypeScript (or TSX) whatever its extension.

This is useful for single-file component formats such as [Vue](https://vuejs.org/guide/scaling-up/sfc.html), whose `<script lang="ts">` blocks reach `ts-loader` under the component's own `.vue` file name:

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

`appendTsxSuffixTo` works the same way for `<script lang="tsx">` blocks, with a `.tsx` rule.

#### useCaseSensitiveFileNames

| Type      | Default Value                                                                |
| --------- | ---------------------------------------------------------------------------- |
| `boolean` | detected from the filesystem your `tsconfig.json` is on (`false` on Windows) |

Controls whether file paths are treated as case-sensitive. By default `ts-loader` checks the filesystem your `tsconfig.json` lives on, the same way `tsc` does, so for example the default macOS volume is treated as case-insensitive. The same value is passed to TypeScript's API, so `ts-loader` and TypeScript always agree on which paths refer to the same file. Set this option to override the detected value.

#### allowTsInNodeModules

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `false`       |

By default, `ts-loader` will not compile `.ts` files in `node_modules`.
You should not need to recompile `.ts` files there, but if you really want to, use this option.
Any `.ts` file in `node_modules` that webpack passes to `ts-loader` is then compiled, whether or not your `tsconfig.json`'s `"files"` or `"include"` lists it (unlike v9, where only the files listed there were compiled). To limit which packages are compiled, narrow the webpack rule instead, e.g. with `include`.

See: [https://github.com/Microsoft/TypeScript/issues/12358](https://github.com/Microsoft/TypeScript/issues/12358)

```javascript
  // in webpack.config.js
  {
    test: /\.ts$/,
    include: [path.resolve(__dirname, 'src'), path.resolve(__dirname, 'node_modules/my_module')],
    loader: 'ts-loader',
    options: { allowTsInNodeModules: true }
  }
```

#### projectReferences

| Type      | Default Value |
| --------- | ------------- |
| `boolean` | `false`       |

> **Note:** In v10, project references in `tsconfig.json` are followed by TypeScript's native API. The `projectReferences` loader option is accepted but has no effect, and v10 doesn't build referenced projects to disk the way `tsc --build` does. The rest of this section describes v9 behaviour.

ts-loader has opt-in support for [project references](https://www.typescriptlang.org/docs/handbook/project-references.html). With this configuration option enabled, `ts-loader` will incrementally rebuild upstream projects the same way `tsc --build` does. Otherwise, source files in referenced projects will be treated as if they’re part of the root project.

In order to make use of this option your project needs to be correctly configured to build the project references and then to use them as part of the build. See the [Project References Guide](REFERENCES.md).

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
