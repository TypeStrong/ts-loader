# TypeScript, Babel, React with `allowJs` for mixed codebases

This setup is mostly intended for people who want to migrate old codebases from JS to TypeScript without having to migrate all of the files at once, and being able to keep a mix of JS and TS files for some time.

Another issue this setup solves is related to the way some modules existent in the npm registry are created or exported. If you let TypeScript take care of the conversion of those modules to a format a browser can understand, some of these modules might end up unusable ([prop-types](https://www.npmjs.com/package/prop-types) is an example). Letting the modules reach webpack untouched (as ES2015 modules) will ensure this problem doesn't occur.

Babel can be removed from this setup unless you're relying on any babel specific plugins.

## Getting started

You'll need [node / npm](https://nodejs.org/) installed.  To get up and running just enter:

```
# Download the npm packages you need (including the type definitions from DefinitelyTyped)
npm install

# Compile the code and serve it up at http://localhost:8080
npm start
```
