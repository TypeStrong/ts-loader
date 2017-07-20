import typescript = require('typescript');
const semver = require('semver');

import interfaces = require('./interfaces');
import constants = require('./constants');
import logger = require('./logger');
import { red, yellow } from 'chalk';

export function getCompiler(
    loaderOptions: interfaces.LoaderOptions,
    log: logger.Logger
) {
    let compiler: typeof typescript | undefined;
    let errorMessage: string | undefined;
    let compilerDetailsLogMessage: string | undefined;
    let compilerCompatible = false;

    try {
        compiler = require(loaderOptions.compiler);
    } catch (e) {
        errorMessage = loaderOptions.compiler === 'typescript'
            ? 'Could not load TypeScript. Try installing with `npm install typescript`. If TypeScript is installed globally, try using `npm link typescript`.'
            : `Could not load TypeScript compiler with NPM package name \`${loaderOptions.compiler}\`. Are you sure it is correctly installed?`;
    }

    if (errorMessage === undefined) {
        compilerDetailsLogMessage = `ts-loader: Using ${loaderOptions.compiler}@${compiler!.version}`;
        compilerCompatible = false;
        if (loaderOptions.compiler === 'typescript') {
            if (compiler!.version && semver.gte(compiler!.version, '1.6.2-0')) {
                // don't log yet in this case, if a tsconfig.json exists we want to combine the message
                compilerCompatible = true;
            } else {
                log.logError(red(`${compilerDetailsLogMessage}. This version is incompatible with ts-loader. Please upgrade to the latest version of TypeScript.`));
            }
        } else {
            log.logWarning(yellow(`${compilerDetailsLogMessage}. This version may or may not be compatible with ts-loader.`));
        }
    }

    return { compiler, compilerCompatible, compilerDetailsLogMessage, errorMessage };
}

export function getCompilerOptions(
    compilerCompatible: boolean,
    compiler: typeof typescript,
    configParseResult: typescript.ParsedCommandLine
) {
    const compilerOptions = Object.assign({}, configParseResult.options, {
        skipDefaultLibCheck: true,
        suppressOutputPathCheck: true, // This is why: https://github.com/Microsoft/TypeScript/issues/7363
    });

    // if `module` is not specified and not using ES6 target, default to CJS module output
    if ((compilerOptions.module === undefined) && compilerOptions.target !== constants.ScriptTargetES2015) {
        compilerOptions.module = constants.ModuleKindCommonJs;
    } else if (compilerCompatible && semver.lt(compiler.version, '1.7.3-0') && compilerOptions.target === constants.ScriptTargetES2015) {
        // special handling for TS 1.6 and target: es6
        compilerOptions.module = constants.ModuleKindNone;
    }

    return compilerOptions;
}
