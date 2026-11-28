const { getTSInstanceFromCache } = require('../../dist/instance-cache');

// Stands in for a compiler process that died: once closed, every call to the
// TypeScript API throws, as it does when the process is gone.
//
// b.ts reaches ts-loader changed by another loader, so the restarted process
// would be told its contents again - but the second build deletes it. The
// third build's new process must not be handed a file that is gone: app.ts
// keeps its "cannot find module" error.
class CloseTypeScriptApiBeforeThirdBuild {
    apply(compiler) {
        let builds = 0;
        compiler.hooks.watchRun.tap('CloseTypeScriptApiBeforeThirdBuild', () => {
            if (++builds === 3) {
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
    plugins: [new CloseTypeScriptApiBeforeThirdBuild()]
}
