import typescript = require('typescript');
import objectAssign = require('object-assign');
import constants = require('./constants');
import interfaces = require('./interfaces');

export function pushArray<T>(arr: T[], toPush: any) {
    Array.prototype.splice.apply(arr, [0, 0].concat(toPush));
}

export function hasOwnProperty<T extends {}>(obj: T, property: string) {
    return Object.prototype.hasOwnProperty.call(obj, property)
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
        .filter(diagnostic => instance.loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) == -1)
        .map<interfaces.WebpackError>(diagnostic => {
            var errorCategory = instance.compiler.DiagnosticCategory[diagnostic.category].toLowerCase();
            var errorCategoryAndCode = errorCategory + ' TS' + diagnostic.code + ': ';

            var messageText = errorCategoryAndCode + instance.compiler.flattenDiagnosticMessageText(diagnostic.messageText, constants.EOL);
            if (diagnostic.file) {
                var lineChar = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                return {
                    message: `${'('.white}${(lineChar.line+1).toString().cyan},${(lineChar.character+1).toString().cyan}): ${messageText.red}`,
                    rawMessage: messageText,
                    location: {line: lineChar.line+1, character: lineChar.character+1},
                    loaderSource: 'ts-loader'
                };
            }
            else {
                return {
                    message:`${messageText.red}`,
                    rawMessage: messageText,
                    loaderSource: 'ts-loader'
                };
            }
        })
        .map(error => <interfaces.WebpackError>objectAssign(error, merge));
}

