const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const typescript = require('typescript/unstable/sync');

function getProgram(tsconfigPath, optionsToExtend) {
    const configFilePath =
        optionsToExtend && Object.keys(optionsToExtend).length > 0
            ? createExtendedConfigFile(tsconfigPath, optionsToExtend)
            : tsconfigPath;
    const api = new typescript.API();
    const snapshot = api.updateSnapshot({ openProjects: [configFilePath] });
    const project = snapshot.getProject(configFilePath);
    if (!project) {
        throw new Error("Error building project");
    }
    return project.program;
}

function getPreEmitDiagnostics(program) {
    return []
        .concat(program.getConfigFileParsingDiagnostics())
        .concat(program.getProgramDiagnostics())
        .concat(program.getGlobalDiagnostics())
        .concat(program.getSyntacticDiagnostics())
        .concat(program.getBindDiagnostics())
        .concat(program.getSemanticDiagnostics())
        .concat(program.getDeclarationDiagnostics());
}

function formatDiagnostic(program, diagnostic) {
    if (!diagnostic.fileName) {
        return `TS${diagnostic.code}: ${diagnostic.text}\n`;
    }

    const sourceFile = program.getSourceFile(diagnostic.fileName);
    const lineAndCharacter =
        sourceFile && diagnostic.pos >= 0
            ? sourceFile.getLineAndCharacterOfPosition(diagnostic.pos)
            : undefined;

    return `${diagnostic.fileName}${lineAndCharacter
        ? `(${lineAndCharacter.line + 1},${lineAndCharacter.character + 1})`
        : ''
        }: TS${diagnostic.code}: ${diagnostic.text}\n`;
}

const newLineKind = {
    LineFeed: 2,
};

module.exports = Object.assign(getProgram, {
    formatDiagnostic,
    getPreEmitDiagnostics,
    newLineKind,
});

function createExtendedConfigFile(tsconfigPath, compilerOptions) {
    const configDirectory = path.join(os.tmpdir(), 'ts-loader-ts7-configs');
    fs.mkdirSync(configDirectory, { recursive: true });

    const fileHash = crypto
        .createHash('sha1')
        .update(JSON.stringify({ tsconfigPath, compilerOptions }))
        .digest('hex')
        .slice(0, 12);
    const configFilePath = path.join(
        configDirectory,
        `${path.basename(tsconfigPath, '.json')}.${fileHash}.json`
    );

    fs.writeFileSync(
        configFilePath,
        JSON.stringify(
            {
                extends: tsconfigPath,
                compilerOptions,
            },
            undefined,
            2
        )
    );

    return configFilePath;
}
