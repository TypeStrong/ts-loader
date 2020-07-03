const typescript = require('typescript');
module.exports = function getProgram(tsconfigPath, optionsToExtend) {
    const parsedCommandLine = typescript.getParsedCommandLineOfConfigFile(tsconfigPath, optionsToExtend || {}, {
        fileExists: typescript.sys.fileExists,
        getCurrentDirectory: typescript.sys.getCurrentDirectory,
        onUnRecoverableConfigFileDiagnostic: function () { throw new Error("Error building project") },
        readFile: typescript.sys.readFile,
        readDirectory: typescript.sys.readDirectory,
        useCaseSensitiveFileNames: typescript.sys.useCaseSensitiveFileNames,
    });
    return typescript.createProgram({ rootNames: parsedCommandLine.fileNames, options: parsedCommandLine.options });
};