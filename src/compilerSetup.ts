import * as semver from 'semver';
import type * as typescript from 'typescript';

import { LoaderOptions } from './interfaces';
import * as logger from './logger';

export function getCompiler(loaderOptions: LoaderOptions, log: logger.Logger) {
  let compiler: typeof typescript | undefined;
  let errorMessage: string | undefined;
  let compilerDetailsLogMessage: string | undefined;
  let compilerCompatible = false;

  try {
    compiler = require(loaderOptions.compiler);
  } catch (e) {
    errorMessage =
      loaderOptions.compiler === 'typescript'
        ? 'Could not load TypeScript. Try installing with `yarn add typescript` or `npm install typescript`. If TypeScript is installed globally, try using `yarn link typescript` or `npm link typescript`.'
        : `Could not load TypeScript compiler with NPM package name \`${loaderOptions.compiler}\`. Are you sure it is correctly installed?`;
  }

  if (errorMessage === undefined) {
    compilerDetailsLogMessage = `ts-loader: Using ${loaderOptions.compiler}@${
      compiler!.version
    }`;
    compilerCompatible = false;
    if (loaderOptions.compiler === 'typescript') {
      if (
        compiler!.version !== undefined &&
        semver.gte(compiler!.version, '3.6.3')
      ) {
        // don't log yet in this case, if a tsconfig.json exists we want to combine the message
        compilerCompatible = true;
      } else {
        log.logError(
          `${compilerDetailsLogMessage}. This version is incompatible with ts-loader. Please upgrade to the latest version of TypeScript.`
        );
      }
    } else {
      log.logWarning(
        `${compilerDetailsLogMessage}. This version may or may not be compatible with ts-loader.`
      );
    }
  }

  return {
    compiler,
    compilerCompatible,
    compilerDetailsLogMessage,
    errorMessage,
  };
}

export function getCompilerOptions(
  configParseResult: typescript.ParsedCommandLine,
  compiler: typeof typescript
) {
  const compilerOptions = Object.assign({}, configParseResult.options, {
    skipLibCheck: true,
    suppressOutputPathCheck: true, // This is why: https://github.com/Microsoft/TypeScript/issues/7363
  } as typescript.CompilerOptions);

  // if `module` is not specified and not using ES6+ target, default to CJS module output
  if (
    compilerOptions.module === undefined &&
    compilerOptions.target !== undefined &&
    compilerOptions.target < compiler.ScriptTarget.ES2015
  ) {
    compilerOptions.module = compiler.ModuleKind.CommonJS;
  }

  if (configParseResult.options.configFile) {
    Object.defineProperty(compilerOptions, 'configFile', {
      enumerable: false,
      writable: false,
      value: configParseResult.options.configFile,
    });
  }

  return compilerOptions;
}
