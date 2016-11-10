import typescript = require('typescript');
import path = require('path');
import fs = require('fs');
import objectAssign = require('object-assign');
import constants = require('./constants');
import interfaces = require('./interfaces');

export function registerWebpackErrors(existingErrors: interfaces.WebpackError[], errorsToPush: interfaces.WebpackError[]) {
    Array.prototype.splice.apply(existingErrors, (<(number | interfaces.WebpackError)[]> [0, 0]).concat(errorsToPush));
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
                let errorMessage = `${'('.white}${(lineChar.line + 1).toString().cyan},${(lineChar.character + 1).toString().cyan}): ${messageText.red}`;
                if (loaderOptions.visualStudioErrorFormat) {
                    errorMessage = path.normalize(diagnostic.file.fileName).red + errorMessage;
                }
                error = makeError({
                    message: errorMessage,
                    rawMessage: messageText,
                    location: { line: lineChar.line + 1, character: lineChar.character + 1 }
                });
            } else {
                error = makeError({ rawMessage: messageText });
            }
            return <interfaces.WebpackError> objectAssign(error, merge);
        });
}

export function readFile(fileName: string) {
    fileName = path.normalize(fileName);
    try {
        return fs.readFileSync(fileName, { encoding: 'utf8' });
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
        message: message || `${rawMessage.red}`,
        loaderSource: 'ts-loader'
    };

    return <interfaces.WebpackError> objectAssign(error, { location, file });
}
