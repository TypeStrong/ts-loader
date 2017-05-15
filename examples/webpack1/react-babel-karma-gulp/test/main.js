/* eslint-disable */
import 'babel-polyfill';

const testsContext = require.context('./', true, /\.tests\.ts(x?)$/);
testsContext.keys().forEach(testsContext);