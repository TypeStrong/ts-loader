# ts-loader 6.0.1 with yarn and resolveTypeReferenceDirectives - not working

This also use the PR of `pnp-webpack-plugin`: https://github.com/arcanis/pnp-webpack-plugin/pull/10 that supplies includes `resolveTypeReferenceDirective`.  See details there

```shell
yarn install

# Run in watch mode
yarn start

# Run in production mode
yarn build 
```

Either results in errors like this:

```shell
ERROR in C:\source\ts-loader\examples\yarn-pnp-resolveTypeReferenceDirectives-broken\tsconfig.json
[tsl] ERROR
      TS2688: Cannot find type definition file for 'anymatch'.

ERROR in C:\source\ts-loader\examples\yarn-pnp-resolveTypeReferenceDirectives-broken\tsconfig.json
[tsl] ERROR
      TS2688: Cannot find type definition file for 'braces'.

ERROR in C:\source\ts-loader\examples\yarn-pnp-resolveTypeReferenceDirectives-broken\tsconfig.json
[tsl] ERROR
      TS2688: Cannot find type definition file for 'micromatch'.

ERROR in C:\source\ts-loader\examples\yarn-pnp-resolveTypeReferenceDirectives-broken\tsconfig.json
[tsl] ERROR
      TS2688: Cannot find type definition file for 'node'.

ERROR in C:\source\ts-loader\examples\yarn-pnp-resolveTypeReferenceDirectives-broken\tsconfig.json
[tsl] ERROR
      TS2688: Cannot find type definition file for 'normalize-package-data'.

ERROR in C:\source\ts-loader\examples\yarn-pnp-resolveTypeReferenceDirectives-broken\tsconfig.json
[tsl] ERROR
      TS2688: Cannot find type definition file for 'semver'.

ERROR in C:\source\ts-loader\examples\yarn-pnp-resolveTypeReferenceDirectives-broken\tsconfig.json
[tsl] ERROR
      TS2688: Cannot find type definition file for 'tapable'.

ERROR in C:\source\ts-loader\examples\yarn-pnp-resolveTypeReferenceDirectives-broken\tsconfig.json
[tsl] ERROR
      TS2688: Cannot find type definition file for 'uglify-js'.

ERROR in C:\source\ts-loader\examples\yarn-pnp-resolveTypeReferenceDirectives-broken\tsconfig.json
[tsl] ERROR
      TS2688: Cannot find type definition file for 'webpack'.
```