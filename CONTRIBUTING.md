# Contributer's Guide

We welcome contributions from the community and have gathered guidelines 
here to help you get started.

## Discussion

While not absolutely required, it is encouraged that you first open an issue 
for any bug or feature request. This allows discussion on the proper course of
action to take before coding begins.

## Building

```shell
yarn install
yarn build
```

## Changing

Most of the information you need to contribute code changes can [be found here](https://guides.github.com/activities/contributing-to-open-source/).
In short: fork, make your changes, and submit a pull request.

## Testing

This project makes use of 2 integration test packs to make sure we don't break anything. That's right, count them, 2! There is a comparison test pack which compares compilation outputs and is long established.  There is also an execution test pack which executes the compiled JavaScript. This test pack is young and contains fewer tests; but it shows promise.

You can run all the tests (in both test packs) with `yarn test`.

To run comparison tests alone use `yarn run comparison-tests`.
To run execution tests alone use `yarn run execution-tests`.

Not all bugs/features necessarily fit into either framework and that's OK. However, most do and therefore you should make every effort to create at least one test which demonstrates the issue or exercises the feature. Use your judgement to decide whether you think a comparison test or an execution test is most appropriate.

To read about the comparison test pack take a look [here](test/comparison-tests/README.md)
To read about the execution test pack take a look [here](test/execution-tests/README.md)

## Debugging

### Debugging tests

If you’re using VS Code, set breakpoints anywhere in `src`. Open any file inside the comparison test or execution test you want to debug, then, in the debug pane, select “Run open comparison test” or “Run open execution test.”

If you’re not using VS Code, simply adding `--debug` to either a `yarn run comparison-tests` or `yarn run execution-tests` will pause before each test (this is best combined with `--single-test`), allowing you to attach to the node process on port 5858 with your favorite debugger.

### Debugging ts-loader installed from npm in your own Webpack project

```sh
node --inspect-brk node_modules/webpack/bin/webpack.js --config webpack.dev.js # Obviously configure this depending upon your project setup
```

Then put a breakpoint in `node_modules/ts-loader/dist/index.js`, and debug in VS Code with "Attach to Node Process". The dist is JS compiled from TS, but it’s still pretty readable.

### Debugging a local, cloned copy of ts-loader in your own Webpack project

Just like the steps above, except substituting a local copy of ts-loader for the one in node_modules:

1. In `ts-loader`, run `yarn build`
2. Still in `ts-loader`, run `npm link`
3. In your own Webpack project directory, run `npm link ts-loader`. There’s now a chain of symlinks from `node_modules/ts-loader` to your cloned copy built from source.
4. Repeat the steps above in “Debugging ts-loader installed from npm...” except now, you can take advantage of source maps, so you can set breakpoints in `ts-loader/src` instead of `ts-loader/dist`.
5. If you want to try making changes to `ts-loader`, make changes and then repeat steps 1 and 4—no need to re-run the `npm link` steps.
6. Run `npm unlink ts-loader` in your own project directory to remove the symlink when you’re done.