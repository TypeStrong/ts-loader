module.exports = function aliasLoaderWithOptions(config, tsLoaderPath, options) {
    var rules = config.module.loaders || config.module.rules;
    rules.forEach(function(rule) {
        rule.loader = rule.loader.replace('ts-loader', tsLoaderPath + (options ? '?' + JSON.stringify(options) : ''));
    });
}
