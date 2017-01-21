module.exports = function aliasLoaderWithOptions(config, tsLoaderPath, options) {
    var rules = config.module.loaders || config.module.rules;
    rules.forEach(function (rule) {
        if (rule.use) {
            rule.use.forEach(function (use) {
                if (use.loader.indexOf('ts-loader') !== -1) {
                    use.loader = use.loader.replace('ts-loader', tsLoaderPath);
                    if (options) {
                        use.options = Object.assign({}, options, rule.options);
                    }
                }
            })
        } else {
            if (rule.loader.indexOf('ts-loader') !== -1) {
                rule.loader = rule.loader.replace('ts-loader', tsLoaderPath);
                if (options) {
                    rule.options = Object.assign({}, options, rule.options);
                }
            }
        }
    });
}
