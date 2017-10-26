# TypeScript, Babel, React with `allowJs` for mixed codebases

This setup is mostly intended for people who want to migrate old codebases from JS to TypeScript without doing everything at once, and who might be reliant on some code absolutely having to go through Babel every time before being handed over to TypeScript.

This can be due to reliance on specific Babel plugins, or weird default exports behaviors on imported node modules which have only been tested with Babel for transpilation.

## Getting started

You'll need [node / npm](https://nodejs.org/) installed.  To get up and running just enter:

```
# Download the npm packages you need (including the type definitions from DefinitelyTyped)
npm install

# Compile the code and serve it up at http://localhost:8080
npm start
```
