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

To debug ts-loader itself:

```
node --inspect-brk node_modules/webpack/bin/webpack.js --config webpack.dev.js # Obviously configure this depending upon your project setup
```

Then put a breakpoint in `node_modules/ts-loader/dist/index.js`, and debug in VS Code with "Attach to Node Process". The dist is JS compiled from TS, but it’s still pretty readable.