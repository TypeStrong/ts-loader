import 'babel-polyfill';

const testsContext = require.context('./', true, /\.tests\.js$/);
testsContext.keys().forEach(testsContext);
