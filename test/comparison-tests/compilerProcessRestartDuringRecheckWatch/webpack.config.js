const { getTSInstanceFromCache } = require('../../dist/instance-cache');

// Stands in for a compiler process that died between building the modules and
// the end-of-build recheck: once closed, every call to the TypeScript API throws.
class CloseTypeScriptApiBeforeSecondRecheck {
    apply(compiler) {
        let builds = 0;
        compiler.hooks.compilation.tap('CloseTypeScriptApiBeforeSecondRecheck', compilation => {
            if (compilation.compiler.isChild()) {
                return;
            }
            const build = ++builds;
            compilation.hooks.finishModules.tap('CloseTypeScriptApiBeforeSecondRecheck', () => {
                if (build === 2) {
                    getTSInstanceFromCache(compiler, 'restart').typeScriptApiInstance.api.close();
                }
            });
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
    plugins: [new CloseTypeScriptApiBeforeSecondRecheck()]
}
