var uppercaseStringLiteralTransformer = require('./uppercaseStringLiteralTransformer').default;

module.exports = (program) => ({
  before: [uppercaseStringLiteralTransformer]
});