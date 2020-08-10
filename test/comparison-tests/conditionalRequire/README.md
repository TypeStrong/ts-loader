This example shows how to do conditional compilation including requiring modules.

See the comments in `app.ts` and `webpack.config.js` for a quick overview of the process.

Try defining and undefining the `DEBUG` constant in `webpack.config.js` and see out it affects
the outputs (e.g. [`expectedOutput-1.6/bundle.js`](expectedOutput-1.6/bundle.js)).

More information can be found at these sites:
- https://www.typescriptlang.org/docs/handbook/modules.html#dynamic-module-loading-in-nodejs
- https://webpack.js.org/plugins/define-plugin/
- https://github.com/webpack/webpack/tree/master/examples/multi-compiler
