# TypeScript loader for webpack

[![npm Version](https://img.shields.io/npm/v/ts-loader.svg)](https://www.npmjs.com/package/ts-loader)
[![Build Status](https://travis-ci.org/TypeStrong/ts-loader.svg?branch=master)](https://travis-ci.org/TypeStrong/ts-loader)
[![Build Status](https://ci.appveyor.com/api/projects/status/bjh0r0d4ckspgkh9/branch/master?svg=true)](https://ci.appveyor.com/project/JohnReilly/ts-loader/branch/master)
[![Downloads](http://img.shields.io/npm/dm/ts-loader.svg)](https://npmjs.org/package/ts-loader)
[![Greenkeeper badge](https://badges.greenkeeper.io/TypeStrong/ts-loader.svg)](https://greenkeeper.io/)
[![Join the chat at https://gitter.im/TypeStrong/ts-loader](https://img.shields.io/badge/gitter-join%20chat-brightgreen.svg)](https://gitter.im/TypeStrong/ts-loader)

This is the typescript loader for webpack.

## Getting Started

### Examples

We have a number of example setups to accomodate different workflows.  From "[vanilla](examples/vanilla)" ts-loader, to using ts-loader in combination with [babel](https://babeljs.io/) for transpilation, [happypack](https://github.com/amireh/happypack) or [thread-loader](https://github.com/webpack-contrib/thread-loader) for faster builds and [fork-ts-checker-webpack-plugin](https://github.com/Realytics/fork-ts-checker-webpack-plugin) for performing type checking in a separate process. Our examples can be found [here](examples/).

### Babel

ts-loader works very well in combination with [babel](https://babeljs.io/) and [babel-loader](https://github.com/babel/babel-loader).  There is an [example](https://github.com/Microsoft/TypeScriptSamples/tree/master/react-flux-babel-karma) of this in the official [TypeScript Samples](https://github.com/Microsoft/TypeScriptSamples). Alternatively take a look at our own [example](examples/react-babel-karma-gulp).

### Faster Builds

As your project becomes bigger and bigger, compilation time increases linearly. It's because typescript's semantic checker has to inspect all files on every rebuild. The simple solution is to disable it by using the `transpileOnly: true` option, but doing so leaves you without type checking.

You probably don't want to give up type checking; that's rather the point of TypeScript.  So what you can do is use the [fork-ts-checker-webpack-plugin](https://github.com/Realytics/fork-ts-checker-webpack-plugin). It runs the type checker on a separate process, so your build remains fast thanks to `transpileOnly: true` but you still have the type checking. Also, the plugin has several optimizations to make incremental type checking faster (AST cache, multiple workers).

If you'd like to see a simple setup take a look at [our simple example](examples/fork-ts-checker/). For a more complex setup take a look at our [more involved example](examples/react-babel-karma-gulp-fork-ts-checker).

If you'd like to make things even faster still (I know, right?) then you might want to consider using ts-loader with [happypack](https://github.com/amireh/happypack) which speeds builds by parallelising work.  (This should be used in combination with  [fork-ts-checker-webpack-plugin](https://github.com/Realytics/fork-ts-checker-webpack-plugin) for typechecking.)  If you'd like to see a simple setup take a look at [our simple example](examples/happypack/). For a more complex setup take a look at our [more involved example](examples/react-babel-karma-gulp-happypack).

There is a "webpack-way" of parallelising builds.  Instead of using happypack you can use ts-loader with ts-loader with [thread-loader](https://github.com/webpack-contrib/thread-loader) and [cache-loader](https://github.com/webpack-contrib/cache-loader) in combination.  (Again, this should be used in combination with  [fork-ts-checker-webpack-plugin](https://github.com/Realytics/fork-ts-checker-webpack-plugin) for typechecking.)  If you'd like to see a simple setup take a look at [our simple example](examples/thread-loader/). For a more complex setup take a look at our [more involved example](examples/react-babel-karma-gulp-thread-loader).

### Installation

```
npm install ts-loader
```

You will also need to install TypeScript if you have not already.

```
npm install typescript
```

### Running

Use webpack like normal, including `webpack --watch` and `webpack-dev-server`, or through another
build system using the [Node.js API](http://webpack.github.io/docs/node.js-api.html).

### Configuration

1. Create or update `webpack.config.js` like so:

    ```javascript
    module.exports = {
      devtool: 'inline-source-map',
      entry: './app.ts',
      output: {
        filename: 'bundle.js'
      },
      resolve: {
        // Add `.ts` and `.tsx` as a resolvable extension.
        extensions: ['.ts', '.tsx', '.js'] // note if using webpack 1 you'd also need a '' in the array as well
      },
      module: {
        loaders: [ // loaders will work with webpack 1 or 2; but will be renamed "rules" in future
          // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
          { test: /\.tsx?$/, loader: 'ts-loader' }
        ]
      }
    }
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

If you want to be able to debug your original source then you can thanks to the magic of sourcemaps.  There are 2 steps to getting this set up with ts-loader and webpack.  

First, for ts-loader to produce **sourcemaps**, you will need to set the [tsconfig.json](http://www.typescriptlang.org/docs/handbook/tsconfig-json.html) option as `"sourceMap": true`.

Second, you need to set the `devtool` option in your `webpack.config.js` to support the type of sourcemaps you want.  To make your choice have a read of the [`devtool` webpack docs](https://webpack.js.org/configuration/devtool/).  You may be somewhat daunted by the choice available.  You may also want to vary the sourcemap strategy depending on your build environment. Here are some example strategies for different environments:

- `devtool: 'inline-source-map'` - Solid sourcemap support; the best "all-rounder".  Works well with karma-webpack (not all strategies do)
- `devtool: 'cheap-module-eval-source-map'` - Best support for sourcemaps whilst debugging.
- `devtool: 'source-map'` - Approach that plays well with UglifyJsPlugin; typically you might use this in Production

### Code Splitting and Loading Other Resources

Loading css and other resources is possible but you will need to make sure that
you have defined the `require` function in a [declaration file](https://www.typescriptlang.org/docs/handbook/writing-declaration-files.html).

```typescript
declare var require: {
    <T>(path: string): T;
    (paths: string[], callback: (...modules: any[]) => void): void;
    ensure: (paths: string[], callback: (require: <T>(path: string) => T) => void) => void;
};
```

Then you can simply require assets or chunks per the [webpack documentation](https://webpack.js.org/guides/code-splitting/).

```js
require('!style!css!./style.css');
```

The same basic process is required for code splitting. In this case, you `import` modules you need but you
don't directly use them. Instead you require them at [split points](http://webpack.github.io/docs/code-splitting.html#defining-a-split-point). See [this example](test/comparison-tests/codeSplitting) and [this example](test/comparison-tests/es6codeSplitting) for more details.

[TypeScript 2.4 provides support for ECMAScript's new `import()` calls. These calls import a module and return a promise to that module.](https://blogs.msdn.microsoft.com/typescript/2017/06/12/announcing-typescript-2-4-rc/)  This is also supported in webpack - details on usage can be found [here](https://webpack.js.org/guides/code-splitting-async/#dynamic-import-import-).  Happy code splitting!

### Compatibility

#### TypeScript / Webpack

ts-loader supports the latest and greatest version of TypeScript right back to v1.6.  

ts-loader supports webpack 2.  It may well still work with webpack 1 but it does not officially support webpack 1 any longer.  Our continuous integration test suites run against webpack 2; **not** webpack 1. 

A full test suite runs each night (and on each pull request). It runs both on [Linux](https://travis-ci.org/TypeStrong/ts-loader) and [Windows](https://ci.appveyor.com/project/JohnReilly/ts-loader), testing ts-loader against each major release of TypeScript from the latest right back to 1.6.  The test suite also runs against TypeScript@next (because we want to use it as much as you do).

If you become aware of issues not caught by the test suite then please let us know. Better yet, write a test and submit it in a PR!

### Failing the build on TypeScript compilation error

When the build fails (i.e. at least one typescript compile error occured), ts-loader does **not** propagate the build failure to webpack.  The upshot of this is you can fail to notice an erroring build. This is inconvenient; particularly in continuous integration scenarios.  If you want to ensure that the build failure is propogated it is advised that you make use of the [webpack-fail-plugin](https://www.npmjs.com/package/webpack-fail-plugin).  This plugin that will make the process return status code 1 when it finishes with errors in single-run mode. Et voilà! Build failure.

For more background have a read of [this issue](https://github.com/TypeStrong/ts-loader/issues/108).

### Options

There are two types of options: TypeScript options (aka "compiler options") and loader options. TypeScript options should be set using a tsconfig.json file. Loader options can be set either using a query when specifying the loader or through the `options` property in the webpack configuration:

```javascript
module.exports = {
  ...
  module: {
    rules: [
      { 
        test: /\.tsx?$/, 
        loader: 'ts-loader', 
        options: {
          transpileOnly: true
        } 
      }
    ]
  }
}
```

Alternatively this can be configured using a query:

```javascript
module.exports = {
  ...
  module: {
    loaders: [
      // specify option using query
      { 
        test: /\.tsx?$/,
        loader: 'ts-loader?' + JSON.stringify({
          transpileOnly: true
        }) }
    ]
  }
}
```

For a full breakdown of the power of query syntax have a read of [this](https://github.com/webpack/loader-utils#getoptions).

### Loader Options

#### transpileOnly *(boolean) (default=false)*

If you want to speed up compilation significantly you can set this flag.
However, many of the benefits you get from static type checking between
different dependencies in your application will be lost. You should also
set the `isolatedModules` TypeScript option if you plan to ever make use
of this.

#### happyPackMode *(boolean) (default=false)*

Enables [`happypack`](https://github.com/amireh/happypack) compatibility mode. This implicitly sets `*transpileOnly*` to `true`. **WARNING!** Some errors will be silently ignored in `happypack` mode (`tsconfig.json` parsing errors, dependency resolution errors, etc.). 

It's advisable to use happypack alongside [fork-ts-checker-webpack-plugin](https://github.com/Realytics/fork-ts-checker-webpack-plugin) to get full type checking again. To see what this looks like in practice then either take a look at [our simple example](examples/happypack). For a more complex setup take a look at our [more involved example](examples/react-babel-karma-gulp-happypack).

#### getCustomTransformers *( () => { before?: TransformerFactory<SourceFile>[]; after?: TransformerFactory<SourceFile>[];  } )*

Provide custom transformers - only compatible with TypeScript 2.3+ (and 2.4 if using `transpileOnly` mode). For example usage take a look at [typescript-plugin-styled-components](https://github.com/Igorbek/typescript-plugin-styled-components) or our [test](test/comparison-tests/customTransformer).

#### logInfoToStdOut *(boolean) (default=false)*

This is important if you read from stdout or stderr and for proper error handling.
The default value ensures that you can read from stdout e.g. via pipes or you use webpack -j to generate json output.

#### logLevel *(string) (default=info)*

Can be `info`, `warn` or `error` which limits the log output to the specified log level.
Beware of the fact that errors are written to stderr and everything else is written to stderr (or stdout if logInfoToStdOut is true).

#### silent *(boolean) (default=false)*

If true, no console.log messages will be emitted. Note that most error
messages are emitted via webpack which is not affected by this flag.

#### ignoreDiagnostics *(number[]) (default=[])*

You can squelch certain TypeScript errors by specifying an array of diagnostic
codes to ignore.

#### compiler *(string) (default='typescript')*

Allows use of TypeScript compilers other than the official one. Should be
set to the NPM name of the compiler, eg [`ntypescript`](https://github.com/basarat/ntypescript).

#### configFileName *(string) (default='tsconfig.json')*

Allows you to specify a custom configuration file.

#### visualStudioErrorFormat *(boolean) (default=false)*

If `true`, the TypeScript compiler output for an error or a warning, e.g. `(3,14): error TS4711: you did something very wrong`, in file `myFile` will instead be `myFile(3,14): error TS4711: you did something very wrong` (notice the file name at the beginning). This way Visual Studio will interpret this line and show any errors or warnings in the *error list*. This enables navigation to the file/line/column through double click.

#### compilerOptions *(object) (default={})*

Allows overriding TypeScript options. Should be specified in the same format
as you would do for the `compilerOptions` property in tsconfig.json.

#### instance *(string)*

Advanced option to force files to go through different instances of the
TypeScript compiler. Can be used to force segregation between different parts
of your code.

#### entryFileIsJs *(boolean) (default=false)*

To be used in concert with the `allowJs` compiler option. If your entry file is JS then you'll need to set this option to true.  Please note that this is rather unusual and will generally not be necessary when using `allowJs`.

#### appendTsSuffixTo *(RegExp[]) (default=[])*
#### appendTsxSuffixTo *(RegExp[]) (default=[])*
A list of regular expressions to be matched against filename. If filename matches one of the regular expressions, a `.ts` or `.tsx` suffix will be appended to that filename.

This is useful for `*.vue` [file format](https://vuejs.org/v2/guide/single-file-components.html) for now. (Probably will benefit from the new single file format in the future.)

Example:

webpack.config.js:

```javascript
module.exports = {
    entry: './index.vue',
    output: { filename: 'bundle.js' },
    resolve: {
        extensions: ['.ts', '.vue']
    },
    module: {
        rules: [
            { test: /\.vue$/, loader: 'vue-loader' },
            { test: /\.ts$/, loader: 'ts-loader', options: { appendTsSuffixTo: [/\.vue$/] } }
        ]
    } 
}
```

index.vue

```vue
<template><p>hello {{msg}}</p></template>
<script lang="ts">
export default {
  data(): Object {
    return {
      msg: "world"
    }
  },
}
</script>
```

We can handle `.tsx` by quite similar way:

webpack.config.js:

```javascript
module.exports = {
    entry: './index.vue',
    output: { filename: 'bundle.js' },
    resolve: {
        extensions: ['.ts', '.tsx', '.vue', '.vuex']
    },
    module: {
        rules: [
            { test: /\.vue$/, loader: 'vue-loader',
              options: {
                loaders: {
                  ts: 'ts-loader',
                  tsx: 'babel-loader!ts-loader',
                }
              }
            },
            { test: /\.ts$/, loader: 'ts-loader', options: { appendTsSuffixTo: [/TS\.vue$/] } }
            { test: /\.tsx$/, loader: 'babel-loader!ts-loader', options: { appendTsxSuffixTo: [/TSX\.vue$/] } }
        ]
    } 
}
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
    return (<div>Content</div>);
  }
}
</script>
```

Or if you want to use only tsx, just use the `appendTsxSuffixTo` option only:

```javascript
            { test: /\.ts$/, loader: 'ts-loader' }
            { test: /\.tsx$/, loader: 'babel-loader!ts-loader', options: { appendTsxSuffixTo: [/\.vue$/] } }
```

### `LoaderOptionsPlugin`

[There's a known "gotcha"](https://github.com/TypeStrong/ts-loader/issues/283) if you are using webpack 2 with the `LoaderOptionsPlugin`.  If you are faced with the `Cannot read property 'unsafeCache' of undefined` error then you probably need to supply a `resolve` object as below: (Thanks @jeffijoe!)
 		
 ```js		
 new LoaderOptionsPlugin({		
   debug: false,		
   options: {		
     resolve: {
       extensions: ['.ts', '.tsx', '.js']
     }	
   }		
 })		
 ```

It's worth noting that use of the `LoaderOptionsPlugin` is [only supposed to be a stopgap measure](https://webpack.js.org/plugins/loader-options-plugin/).  You may want to look at removing it entirely.

## Contributing

This is your TypeScript loader! We want you to help make it even better. Please feel free to contribute; see the [contributor's guide](CONTRIBUTING.md) to get started.

## License

MIT License
