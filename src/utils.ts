import * as typescript from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { white, red, cyan } from 'chalk';

import constants = require('./constants');
import { 
    DependencyGraph,
    LoaderOptions,
    ReverseDependencyGraph,
    WebpackError,
    WebpackModule
} from './interfaces';

export function registerWebpackErrors(existingErrors: WebpackError[], errorsToPush: WebpackError[]) {
    Array.prototype.splice.apply(existingErrors, (<(number | WebpackError)[]>[0, 0]).concat(errorsToPush));
}

export function hasOwnProperty<T extends {}>(obj: T, property: string) {
    return Object.prototype.hasOwnProperty.call(obj, property);
}

/**
 * Take TypeScript errors, parse them and format to webpack errors
 * Optionally adds a file name
 */
export function formatErrors(
    diagnostics: typescript.Diagnostic[] | undefined,
    loaderOptions: LoaderOptions,
    compiler: typeof typescript,
    merge?: { file?: string; module?: WebpackModule }
): WebpackError[] {

    return diagnostics
        ? diagnostics
            .filter(diagnostic => loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) === -1)
            .map<WebpackError>(diagnostic => {
                const errorCategory = compiler.DiagnosticCategory[diagnostic.category].toLowerCase();
                const errorCategoryAndCode = errorCategory + ' TS' + diagnostic.code + ': ';

                const messageText = errorCategoryAndCode + compiler.flattenDiagnosticMessageText(diagnostic.messageText, constants.EOL);
                let error: WebpackError;
                if (diagnostic.file !== undefined) {
                    const lineChar = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
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
                return <WebpackError>Object.assign(error, merge);
            })
        : [];
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

export function makeError({ rawMessage, message, location, file }: MakeError): WebpackError {
    const error = {
        rawMessage,
        message: message || `${red(rawMessage)}`,
        loaderSource: 'ts-loader'
    };

    return <WebpackError>Object.assign(error, { location, file });
}

export function appendSuffixIfMatch(patterns: RegExp[], path: string, suffix: string): string {
    if (patterns.length > 0) {
        for (let regexp of patterns) {
            if (path.match(regexp)) {
                return path + suffix;
            }
        }
    }
    return path;
}

export function appendSuffixesIfMatch(suffixDict: {[suffix: string]: RegExp[]}, path: string): string {
    for(let suffix in suffixDict) {
        path = appendSuffixIfMatch(suffixDict[suffix], path, suffix);
    }
    return path;
}

/**
 * Recursively collect all possible dependants of passed file
 */
export function collectAllDependants(
    reverseDependencyGraph: ReverseDependencyGraph,
    fileName: string,
    collected: { [file: string]: boolean } = {}
): string[] {
    const result = {};
    result[fileName] = true;
    collected[fileName] = true;
    const dependants = reverseDependencyGraph[fileName];
    if (dependants !== undefined) {
        Object.keys(dependants).forEach(dependantFileName => {
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
    dependencyGraph: DependencyGraph,
    filePath: string,
    collected: { [file: string]: boolean } = {}
): string[] {
    const result = {};
    result[filePath] = true;
    collected[filePath] = true;
    let directDependencies = dependencyGraph[filePath];
    if (directDependencies !== undefined) {
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