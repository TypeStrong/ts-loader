/* eslint-disable no-var, strict, prefer-arrow-callback */
'use strict';

module.exports = function(env) {
  return require(`./webpack.${env}.js`)
}
