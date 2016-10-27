import typescript = require('typescript');
const semver = require('semver');

import interfaces = require('./interfaces');
import logger = require('./logger');

export function getCompiler(
    loaderOptions: interfaces.LoaderOptions,
    log: logger.Logger
) {
    let compiler: typeof typescript;
    let errorMessage: string;
    let compilerDetailsLogMessage: string;
    let compilerCompatible = false;

    try {
        compiler = require(loaderOptions.compiler);
    } catch (e) {
        errorMessage = loaderOptions.compiler === 'typescript'
            ? 'Could not load TypeScript. Try installing with `npm install typescript`. If TypeScript is installed globally, try using `npm link typescript`.'
            : `Could not load TypeScript compiler with NPM package name \`${loaderOptions.compiler}\`. Are you sure it is correctly installed?`;
    }

    if (!errorMessage) {
        compilerDetailsLogMessage = `ts-loader: Using ${loaderOptions.compiler}@${compiler.version}`;
        compilerCompatible = false;
        if (loaderOptions.compiler === 'typescript') {
            if (compiler.version && semver.gte(compiler.version, '1.6.2-0')) {
                // don't log yet in this case, if a tsconfig.json exists we want to combine the message
                compilerCompatible = true;
            } else {
                log.logError(`${compilerDetailsLogMessage}. This version is incompatible with ts-loader. Please upgrade to the latest version of TypeScript.`.red);
            }
        } else {
            log.logWarning(`${compilerDetailsLogMessage}. This version may or may not be compatible with ts-loader.`.yellow);
        }
    }

    return { compiler, compilerCompatible, compilerDetailsLogMessage, errorMessage };
}
