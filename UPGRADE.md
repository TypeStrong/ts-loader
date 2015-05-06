# Upgrade Guide

## v0.3.x to v0.4.x

This release added support for TypeScript 1.5. One of the major changes
introduced in TypeScript 1.5 is the 
[tsconfig.json](https://github.com/Microsoft/TypeScript/wiki/tsconfig.json)
file. All of the TypeScript options that were previously defined through
the loader querystring (`module`, `target`, etc) should now be specified
in the tsconfig.json file instead. The querystring options have been
removed. 