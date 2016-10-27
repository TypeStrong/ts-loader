import typescript = require('typescript');
import path = require('path');
import fs = require('fs');
import objectAssign = require('object-assign');
import constants = require('./constants');
import interfaces = require('./interfaces');

export function pushArray<T>(arr: T[], toPush: any) {
    Array.prototype.splice.apply(arr, [0, 0].concat(toPush));
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
    instance: interfaces.TSInstance,
    merge?: any): interfaces.WebpackError[] {

    return diagnostics
        .filter(diagnostic => instance.loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) === -1)
        .map<interfaces.WebpackError>(diagnostic => {
            const errorCategory = instance.compiler.DiagnosticCategory[diagnostic.category].toLowerCase();
            const errorCategoryAndCode = errorCategory + ' TS' + diagnostic.code + ': ';

            const messageText = errorCategoryAndCode + instance.compiler.flattenDiagnosticMessageText(diagnostic.messageText, constants.EOL);
            if (diagnostic.file) {
                const lineChar = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                return makeError({
                    message: `${'('.white}${(lineChar.line + 1).toString().cyan},${(lineChar.character + 1).toString().cyan}): ${messageText.red}`,
                    rawMessage: messageText,
                    location: { line: lineChar.line + 1, character: lineChar.character + 1 }
                });
            } else {
                return makeError({ rawMessage: messageText });
            }
        })
        .map(error => <interfaces.WebpackError> objectAssign(error, merge));
}

export function readFile(fileName: string) {
    fileName = path.normalize(fileName);
    try {
        return fs.readFileSync(fileName, { encoding: 'utf8' });
    } catch (e) {
        return;
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
        message: message || `${rawMessage.red}`,
        loaderSource: 'ts-loader'
    };

    return <interfaces.WebpackError> objectAssign(error, { location, file });
}
