[![Build Status](https://travis-ci.org/jbrantly/ts-loader.svg?branch=master)](https://travis-ci.org/jbrantly/ts-loader)
[![Downloads](http://img.shields.io/npm/dm/ts-loader.svg)](https://npmjs.org/package/ts-loader)

# TypeScript loader for webpack

## Usage

A step by step tutorial is [available here](http://www.jbrantly.com/typescript-and-webpack/).

### Installation

```
npm install ts-loader
```

You will also need to install TypeScript if you have not already.

```
npm install -g typescript
```

### Upgrading

Take advantage of the [Changelog](CHANGELOG.md) and [Upgrade Guide](UPGRADE.md).

### Running

Use webpack like normal, including `webpack --watch` and `webpack-dev-server`, or through another
build system using the [Node.js API](http://webpack.github.io/docs/node.js-api.html).

### Compatibility

The current version is compatible with TypeScript 1.5 and with the [nightly build](http://blogs.msdn.com/b/typescript/archive/2015/07/27/introducing-typescript-nightlies.aspx). 
You may experience issues using the nightly build due to its nature, but a full test suite runs
against the latest nightly every day to catch incompatibilites early. Please report any issues 
you experience with the nightly so that they can be fixed promptly.

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
          { test: /\.ts(x?)$/, loader: 'ts-loader' }
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
      "files": [
        "path/to/declaration.d.ts"
      ]
    }
    ```

The [tsconfig.json](https://github.com/Microsoft/TypeScript/wiki/tsconfig.json) file controls
TypeScript-related options so that your IDE, the `tsc` command, and this loader all share the 
same options. The `files` property should generally be specified even if its just an empty array.
If the `files` property is not specified, then **all** TypeScript files in the directory and
subdirectories will be included, possibly even ones that should not be.

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
      { test: /\.ts$/, loader: 'ts-loader?compiler=ntypescript' }
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

##### silent *(boolean) (default=false)*

If true, no console.log messages will be emitted. Note that most error
messages are emitted via webpack which is not affected by this flag.

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
you have defined the `require` function in a declaration file.

```
declare var require: {
    <T>(path: string): T;
    (paths: string[], callback: (...modules: any[]) => void): void;
    ensure: (paths: string[], callback: (require: <T>(path: string) => T) => void) => void;
};
```

Then you can simply require assets or chunks per the [webpack documentation](http://webpack.github.io/docs).

```
require('!style!css!./style.css');
```

The same basic process is required for code splitting. In this case, you `import` modules you need but you
don't directly use them. Instead you require them at [split points](http://webpack.github.io/docs/code-splitting.html#defining-a-split-point). 
See [this example](test/codeSplitting) for more details. 

### React JSX

The nightly version of TypeScript supports JSX natively. See the [JSX test](test/jsx) for an example.

## Building from source

```
npm install
tsc index.ts --module commonjs
```

## License

The MIT License (MIT)

Copyright (c) 2015 James Brantly

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

