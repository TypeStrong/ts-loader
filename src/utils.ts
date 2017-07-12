import typescript = require('typescript');
import path = require('path');
import fs = require('fs');
import { white, red, cyan } from 'chalk';

import constants = require('./constants');
import interfaces = require('./interfaces');

export function registerWebpackErrors(existingErrors: interfaces.WebpackError[], errorsToPush: interfaces.WebpackError[]) {
    Array.prototype.splice.apply(existingErrors, (<(number | interfaces.WebpackError)[]>[0, 0]).concat(errorsToPush));
}

export function hasOwnProperty<T extends {}>(obj: T, property: string) {
    return Object.prototype.hasOwnProperty.call(obj, property);
}

/**
 * Take TypeScript errors, parse them and format to webpack errors
 * Optionally adds a file name
 */
export function formatErrors(
    diagnostics: typescript.Diagnostic[],
    loaderOptions: interfaces.LoaderOptions,
    compiler: typeof typescript,
    merge?: { file?: string; module?: interfaces.WebpackModule }
): interfaces.WebpackError[] {

    return diagnostics
        .filter(diagnostic => loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) === -1)
        .map<interfaces.WebpackError>(diagnostic => {
            const errorCategory = compiler.DiagnosticCategory[diagnostic.category].toLowerCase();
            const errorCategoryAndCode = errorCategory + ' TS' + diagnostic.code + ': ';

            const messageText = errorCategoryAndCode + compiler.flattenDiagnosticMessageText(diagnostic.messageText, constants.EOL);
            let error: interfaces.WebpackError;
            if (diagnostic.file) {
                const lineChar = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                let errorMessage = `${white('(')}${cyan((lineChar.line + 1).toString())},${cyan((lineChar.character + 1).toString())}): ${red(messageText)}`;
                if (loaderOptions.visualStudioErrorFormat) {
                    errorMessage = red(path.normalize(diagnostic.file.fileName)) + errorMessage;
                }
                error = makeError({
                    message: errorMessage,
                    rawMessage: messageText,
                    location: { line: lineChar.line + 1, character: lineChar.character + 1 }
                });
            } else {
                error = makeError({ rawMessage: messageText });
            }
            return <interfaces.WebpackError>Object.assign(error, merge);
        });
}

export function readFile(fileName: string) {
    fileName = path.normalize(fileName);
    try {
        return fs.readFileSync(fileName, 'utf8');
    } catch (e) {
        return undefined;
    }
}

interface MakeError {
    rawMessage: string;
    message?: string;
    location?: { line: number, character: number };
    file?: string;
}

export function makeError({ rawMessage, message, location, file }: MakeError): interfaces.WebpackError {
    const error = {
        rawMessage,
        message: message || `${red(rawMessage)}`,
        loaderSource: 'ts-loader'
    };

    return <interfaces.WebpackError>Object.assign(error, { location, file });
}

export function appendTsSuffixIfMatch(patterns: RegExp[], path: string): string {
    if (patterns.length > 0) {
        for (let regexp of patterns) {
            if (path.match(regexp)) {
                return path + '.ts';
            }
        }
    }
    return path;
}

export function appendTsxSuffixIfMatch(patterns: RegExp[], path: string): string {
    if (patterns.length > 0) {
        for (let regexp of patterns) {
            if (path.match(regexp)) {
                return path + '.tsx';
            }
        }
    }
    return path;
}

/**
 * Recursively collect all possible dependants of passed file
 */
export function collectAllDependants(
    reverseDependencyGraph: interfaces.ReverseDependencyGraph,
    fileName: string,
    collected: {[file:string]: boolean} = {}
): string[] {
    const result = {};
    result[fileName] = true;
    collected[fileName] = true;
    if (reverseDependencyGraph[fileName]) {
        Object.keys(reverseDependencyGraph[fileName]).forEach(dependantFileName => {
            if (!collected[dependantFileName]) {
                collectAllDependants(reverseDependencyGraph, dependantFileName, collected)
                    .forEach(fName => result[fName] = true);
            }
        });
    }
    return Object.keys(result);
}

/**
 * Recursively collect all possible dependencies of passed file
 */
export function collectAllDependencies(
    dependencyGraph: interfaces.DependencyGraph,
    filePath: string,
    collected: {[file:string]: boolean} = {}
): string[] {
    const result = {};
    result[filePath] = true;
    collected[filePath] = true;
    let directDependencies = dependencyGraph[filePath]; 
    if (directDependencies) {
        directDependencies.forEach(dependencyModule => {
            if (!collected[dependencyModule.originalFileName]) {
                collectAllDependencies(dependencyGraph, dependencyModule.resolvedFileName, collected)
                    .forEach(filePath => result[filePath] = true);
            }
        });
    }
    return Object.keys(result);
}

export function arrify<T>(val: T | T[]) {
	if (val === null || val === undefined) {
		return [];
	}

	return Array.isArray(val) ? val : [val];
};