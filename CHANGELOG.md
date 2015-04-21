# Changelog

## v0.3.4

- Exclude TS 1.5 as a dependency since there are breaking changes

## v0.3.3

- Add support for reporting errors in declaration files (#10)
- Add support for watch mode for declaration files (#11)
- Fix issue with extra `sourceMappingURL` in output files (#12)

## v0.3.2

- Add support for manually adding files (#6)
- Add paths to source maps (#8)

## v0.3.1

- Add support for specifying a custom TypeScript compiler

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