const testsContext = require.context('./', true, /\.tests\.ts$/);
testsContext.keys().forEach(testsContext);
