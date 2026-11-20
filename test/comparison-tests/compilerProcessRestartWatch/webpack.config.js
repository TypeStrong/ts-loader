const { getTSInstanceFromCache } = require('../../dist/instance-cache');

// Stands in for a compiler process that died: once closed, every call to the
// TypeScript API throws, as it does when the process is gone.
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
            { test: /\.ts$/, loader: 'ts-loader', options: { instance: 'restart' } }
        ]
    },
    plugins: [new CloseTypeScriptApiBeforeSecondBuild()]
}
