[![Build Status](https://travis-ci.org/TypeStrong/ts-loader.svg?branch=master)](https://travis-ci.org/TypeStrong/ts-loader)
[![Build Status](https://ci.appveyor.com/api/projects/status/cdpk4ralr2rfmeky/branch/master?svg=true)](https://ci.appveyor.com/project/jbrantly/ts-loader)
[![Downloads](http://img.shields.io/npm/dm/ts-loader.svg)](https://npmjs.org/package/ts-loader)
[![Join the chat at https://gitter.im/TypeStrong/ts-loader](https://img.shields.io/badge/gitter-join%20chat-brightgreen.svg)](https://gitter.im/TypeStrong/ts-loader)

# TypeScript loader for webpack

This is the typescript loader for webpack.

## Getting Started

Tutorials and examples can be [found here](https://github.com/TypeStrong/ts-loader/wiki/Tutorials-&-Examples).

### Compatibility

ts-loader supports the latest and greatest version of TypeScript right back to v1.6.  (Including the [nightly build](http://blogs.msdn.com/b/typescript/archive/2015/07/27/introducing-typescript-nightlies.aspx).)

A full test suite runs each night (and on each pull request). It runs both on Linux ([Travis](https://travis-ci.org/)) and Windows ([AppVeyor](https://www.appveyor.com/)), testing ts-loader against the following versions of TypeScript:
- TypeScript 2.0
- TypeScript 1.8
- TypeScript 1.7
- TypeScript 1.6

and also: 
- TypeScript@next (because we want to use it as much as you do)

If you become aware of issues not caught by the test suite then please let us know. Better yet, write a test and submit it in a PR!

### Babel

ts-loader works very well in combination with [babel](https://babeljs.io/) and [babel-loader](https://github.com/babel/babel-loader).  To see an example of this in practice take a look at the [example](https://github.com/Microsoft/TypeScriptSamples/tree/master/react-flux-babel-karma) in the official [TypeScript Samples](https://github.com/Microsoft/TypeScriptSamples).

### Contributing

This is your TypeScript loader! We want you to help make it even better. Please feel free to contribute; see the [contributer's guide](CONTRIBUTING.md) to get started.

### Installation

```
npm install ts-loader
```

You will also need to install TypeScript if you have not already.

```
npm install typescript
```

or if you want to install TypeScript globally

```
npm install typescript -g
npm link typescript
```

### Running

Use webpack like normal, including `webpack --watch` and `webpack-dev-server`, or through another
build system using the [Node.js API](http://webpack.github.io/docs/node.js-api.html).

### Configuration

1. Create or update `webpack.config.js` like so:

    ```javascript
    module.exports = {
      entry: './app.ts',
      output: {
        filename: 'bundle.js'
      },
      resolve: {
        // Add `.ts` and `.tsx` as a resolvable extension.
        extensions: ['', '.webpack.js', '.web.js', '.ts', '.tsx', '.js']
      },
      module: {
        loaders: [
          // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
          { test: /\.tsx?$/, loader: 'ts-loader' }
        ]
      }
    }
    ```

2. Add a `tsconfig.json` file. <a name="tsconfig"></a>

    ```javascript
    {
      "compilerOptions": {
        "target": "es5",
        "sourceMap": true
      },
      "exclude": [
        "node_modules"
      ]
    }
    ```

The [tsconfig.json](https://github.com/Microsoft/TypeScript/wiki/tsconfig.json) file controls
TypeScript-related options so that your IDE, the `tsc` command, and this loader all share the
same options. TypeScript files from all subdirectories will get included except the ones matching `exclude`.

### Failing the build on TypeScript compilation error

When the build fails (i.e. at least one typescript compile error occured), ts-loader does **not** propagate the build failure to webpack.  The upshot of this is you can fail to notice an erroring build. This is inconvenient; particularly in continuous integration scenarios.  If you want to ensure that the build failure is propogated it is advised that you make use of the [webpack-fail-plugin](https://www.npmjs.com/package/webpack-fail-plugin).  This plugin that will make the process return status code 1 when it finishes with errors in single-run mode. Et voilà! Build failure.

For more background have a read of [this issue](https://github.com/TypeStrong/ts-loader/issues/108).

### Upgrading

Take advantage of the [Changelog](CHANGELOG.md) and [Upgrade Guide](UPGRADE.md).

#### Options

There are two types of options: TypeScript options (aka "compiler options") and loader options.
TypeScript options should be set using a tsconfig.json file. Loader options can be set either
using a query when specifying the loader or through the `ts` property in the webpack configuration.

```javascript
module.exports = {
  ...
  module: {
    loaders: [
      // specify option using query
      { test: /\.tsx?$/, loader: 'ts-loader?compiler=ntypescript' }
    ]
  },
  // specify option using `ts` property
  ts: {
    compiler: 'ntypescript'
  }
}
```

##### transpileOnly *(boolean) (default=false)*

If you want to speed up compilation significantly you can set this flag.
However, many of the benefits you get from static type checking between
different dependencies in your application will be lost. You should also
set the `isolatedModules` TypeScript option if you plan to ever make use
of this.

##### logInfoToStdOut *(boolean) (default=false)*

This is important if you read from stdout or stderr and for proper error handling.
The default value ensures that you can read from stdout e.g. via pipes or you use webpack -j to generate json output.

##### logLevel *(string) (default=info)*

Can be `info`, `warn` or `error` which limits the log output to the specified log level.
Beware of the fact that errors are written to stderr and everything else is written to stderr (or stdout if logInfoToStdOut is true).

##### silent *(boolean) (default=false)*

If true, no console.log messages will be emitted. Note that most error
messages are emitted via webpack which is not affected by this flag.

##### ignoreDiagnostics *(number[]) (default=[])*

You can squelch certain TypeScript errors by specifying an array of diagnostic
codes to ignore. 

##### compiler *(string) (default='typescript')*

Allows use of TypeScript compilers other than the official one. Should be
set to the NPM name of the compiler, eg [`ntypescript`](https://github.com/basarat/ntypescript).

##### configFileName *(string) (default='tsconfig.json')*

Allows you to specify a custom configuration file.

##### compilerOptions *(object) (default={})*

Allows overriding TypeScript options. Should be specified in the same format
as you would do for the `compilerOptions` property in tsconfig.json.

##### instance *(string)*

Advanced option to force files to go through different instances of the
TypeScript compiler. Can be used to force segregation between different parts
of your code.

### Loading other resources and code splitting

Loading css and other resources is possible but you will need to make sure that
you have defined the `require` function in a [declaration file](https://www.typescriptlang.org/docs/handbook/writing-declaration-files.html).

```typescript
declare var require: {
    <T>(path: string): T;
    (paths: string[], callback: (...modules: any[]) => void): void;
    ensure: (paths: string[], callback: (require: <T>(path: string) => T) => void) => void;
};
```

Then you can simply require assets or chunks per the [webpack documentation](http://webpack.github.io/docs).

```js
require('!style!css!./style.css');
```

The same basic process is required for code splitting. In this case, you `import` modules you need but you
don't directly use them. Instead you require them at [split points](http://webpack.github.io/docs/code-splitting.html#defining-a-split-point).
See [this example](test/codeSplitting) for more details.

## License

MIT License

