var objectAssign = require("object-assign");

module.exports = function aliasLoaderWithOptions(config, tsLoaderPath, options) {
    var rules = config.module.loaders || config.module.rules;
    rules.forEach(function(rule) {
        rule.loader = rule.loader.replace('ts-loader', tsLoaderPath);
        if (options) {
            rule.options = objectAssign({}, options, rule.options);
        }
    });
}
