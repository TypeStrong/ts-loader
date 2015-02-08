# TypeScript loader for webpack

## Usage

### Installation

```
npm install ts-loader
```

### Configuration

1. Add `.ts` as a resolvable extension.
2. Configure all files with a `.ts` extension to be handled by `ts-loader`.

```
module.exports = {
    entry: './app.ts',
    resolve: {
        extensions: ['', '.webpack.js', '.web.js', '.js', '.ts']
    },
    module: {
        loaders: [
            { test: /\.ts$/, loader: 'ts-loader?sourceMap&target=ES3' }
        ]
    }
}
```
#### Options

##### target

Specify the TypeScript output target.

- ES3
- **ES5 (default)**
- ES6

##### module

Specify the type of modules that TypeScript emits.

- **CommonJS (default)**
- AMD

##### sourceMap *(boolean) (default=false)*

Specify whether or not TypeScript emits source maps. 

##### noImplicitAny *(boolean) (default=false)*

Specify whether or not TypeScript will allow inferring the `any` type.

##### instance *(string)*

Advanced option to force files to go through different instances of the
TypeScript compiler. Can be used to force segregation between different parts
of your code. Can typically be ignored.

### Declaration files

All declaration files should be resolvable from the entry file. The easiest way
to do this is to create a `_references.d.ts` file which contains references to
all of your declaration files. Then reference `_references.d.ts` from your
entry file.

_references.d.ts
```
///<reference path="path/to/declaration.d.ts" />
///<reference path="path/to/another/declaration.d.ts" />
```

app.ts
```
///<reference path="path/to/_references.d.ts" />

import MyClass = require('./MyClass');

...

```

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

### React JSX

Please see [ts-jsx-loader](https://github.com/jbrantly/ts-jsx-loader)

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

