const { getTSInstanceFromCache } = require('../../dist/instance-cache');

// Stands in for a compiler process that died: once closed, every call to the
// TypeScript API throws, as it does when the process is gone.
//
// b.ts reaches ts-loader changed by another loader, and isn't compiled again
// in the second build. The restarted process has to be told its contents, or
// it reads b.ts from disk and app.ts loses its error.
class CloseTypeScriptApiBeforeSecondBuild {
    apply(compiler) {
        let builds = 0;
        compiler.hooks.watchRun.tap('CloseTypeScriptApiBeforeSecondBuild', () => {
            if (++builds === 2) {
                getTSInstanceFromCache(compiler, 'restart').typeScriptApiInstance.api.close();
            }
        });
    }
}

module.exports = {
    mode: 'development',
    entry: './app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            { test: /\.ts$/, loader: 'ts-loader', options: { instance: 'restart' } },
            { test: /\.ts$/, enforce: 'pre', loader: './make-b-a-string-loader.js' }
        ]
    },
    plugins: [new CloseTypeScriptApiBeforeSecondBuild()]
}
