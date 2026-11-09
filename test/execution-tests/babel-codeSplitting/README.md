This test shows code splitting with TypeScript, Babel and webpack, both ways webpack supports:

- the dynamic `import()` syntax (`test/app.tests.ts`), which needs `"module": "esnext"` so TypeScript leaves `import()` for webpack
- webpack's own `require.ensure` (`test/requireEnsure.tests.ts`)

More information:
- https://webpack.js.org/guides/code-splitting/
- https://github.com/tc39/proposal-dynamic-import
