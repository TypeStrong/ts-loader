# Large Scale Ready, Fast Incremental Builds with ts-loader

This example follows the principles outlined in [](https://medium.com/@kenneth_chau/speeding-up-webpack-typescript-incremental-builds-by-7x-3912ba4c1d15) making sure that the incremental build speeds can scale up to thousands of modules with `ts-loader`.

Some highlights of this example:

* `cache-loader`'s writes slows down the incremental builds; so we skip it
* `forked-ts-checker-webpack-plugin` is used to do typechecking in a separate thread
* `webpack-dev-server` is used so that the files are written to memory
* package.json's `engines` field is filled with required versions of node that will ensure fastest webpack builds
* separated production vs development webpack configuration files for specific use cases


```shell
yarn install

# Run in watch mode
yarn start

# Run in production mode
yarn build
```

To see your output simply open up the `http://localhost:8080/` in your browser of choice.