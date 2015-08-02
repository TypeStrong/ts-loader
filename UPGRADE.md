# Upgrade Guide

## v0.4.x to v0.5.x

This release removed the dependency on TypeScript from the loader. This
was done so that it's very easy to use the nightly version of TypeScript
by installing `typescript@next`. This does mean that you are responsible
for installing TypeScript yourself.

## v0.3.x to v0.4.x

This release added support for TypeScript 1.5. One of the major changes
introduced in TypeScript 1.5 is the 
[tsconfig.json](https://github.com/Microsoft/TypeScript/wiki/tsconfig.json)
file. All of the TypeScript options that were previously defined through
the loader querystring (`module`, `target`, etc) should now be specified
in the tsconfig.json file instead. The querystring options have been
removed. 