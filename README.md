# TypeScript loader for webpack

## Usage

A step by step tutorial is [available here](http://www.jbrantly.com/typescript-and-webpack/).

### Installation

```
npm install ts-loader
```

### Upgrading

Take advantage of the [Changelog](CHANGELOG.md) and [Upgrade Guide](UPGRADE.md).

### Running

Use webpack like normal, including `webpack --watch` and `webpack-dev-server`, or through another
build system using the [Node.js API](http://webpack.github.io/docs/node.js-api.html).

### Compatibility

The current version is compatible with TypeScript 1.5 and with the nightly build using [ntypescript](https://github.com/basarat/ntypescript) (use the `compiler` option, see below). You may experience issues using the nightly build due to its nature. Please feel free to report any such issues so that they can be fixed promptly.

### Configuration

1. Add `.ts` and `.tsx` as a resolvable extension.
2. Configure all files with a `.ts` and `.tsx` extension to be handled by `ts-loader` in your `webpack.config.js`.

```javascript
module.exports = {
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['', '.webpack.js', '.web.js', '.ts', '.tsx', '.js']
    },
    module: {
        loaders: [
            { test: /\.ts(x?)$/, loader: 'ts-loader' }
        ]
    }
}
```

3. Add a `tsconfig.json` file.

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

Your [tsconfig.json](https://github.com/Microsoft/TypeScript/wiki/tsconfig.json) file controls
TypeScript-related options so that your IDE, the `tsc` command, and this loader all share the 
same options. The `files` property should generally be specified even if its just an empty array.
If the `files` property is not specified, then **all** TypeScript files in the directory and
subdirectories will be included, possibly even ones that should not be.

#### Options

Most TypeScript-related options should be set using a 
[tsconfig.json](https://github.com/Microsoft/TypeScript/wiki/tsconfig.json)
file. There are a few loader-specific options you can set although in general
you should not need to. These can be set either using a query when specifying
the loader or through the `ts` property in the webpack configuration.

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

##### silent *(boolean) (default=false)*

If true, no console.log messages will be emitted. Note that most error
messages are emitted via webpack which is not affected by this flag.

##### compiler *(string) (default='typescript')*

Allows use of TypeScript compilers other than the official one. Should be
set to the NPM name of the compiler. Especially useful for the [nightly
build of TypeScript](https://github.com/basarat/ntypescript).

##### instance *(string)*

Advanced option to force files to go through different instances of the
TypeScript compiler. Can be used to force segregation between different parts
of your code.

##### configFileName *(string) (default='tsconfig.json')*

Allows you to specify a custom configuration file.

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

This loader supports using [jsx-typescript](https://github.com/fdecampredon/jsx-typescript).
Simply install jsx-typescript and use the `compiler=jsx-typescript` option. Note that you
will need to use ts-loader@0.3.x in order to use this as 0.4.x and above is not API-compatible. 

You may also be interested in using [ts-jsx-loader](https://github.com/jbrantly/ts-jsx-loader).

If you like living on the edge, the nightly version of TypeScript supports JSX natively. See
the [JSX test](test/jsx) for an example.

## Building from source

```
tsd reinstall
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

