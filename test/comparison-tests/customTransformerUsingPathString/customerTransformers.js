var uppercaseStringLiteralTransformer = require('./uppercaseStringLiteralTransformer').default;

module.exports = () => ({
  before: [uppercaseStringLiteralTransformer]
});