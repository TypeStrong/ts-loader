On the TypeScript 7 API, ts-loader accepts the `resolveModuleName`, `resolveTypeReferenceDirective` and `getCustomTransformers` loader options for backwards compatibility, but doesn't use them (see `validLoaderOptions` in `src/index.ts`).

This test checks that a build using all three still succeeds and its code runs. Each option is set to something that would work if it were used, so the test keeps passing if the API adds these hooks later. The `loaderOptions` and `resolveModuleName` tests cover what the options actually do, and are skipped until then.
