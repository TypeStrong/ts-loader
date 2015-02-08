# Changelog

## v0.3.0

- Change how modules are resolved. Imports and declaration file references are
now resolved through TypeScript instead of being resolved through webpack's
`resolve` API. This fixes a number of issues and better aligns the loader to
work as a replacement for the `tsc` command. (#3, #4, #5)

## v0.2.3

- Add noImplicitAny option (#2)

## v0.2.2

- Fix issue with source maps

## v0.2.1

- Add colors to error output

## v0.2.0

- Add new configuration options (#1)
  - target, module, sourceMap, instance
  - sourceMap default changed from `true` to `false`
- Workaround issue with TypeScript always emitting Windows-style new lines
- Add tests

## v0.1.0

- Initial version