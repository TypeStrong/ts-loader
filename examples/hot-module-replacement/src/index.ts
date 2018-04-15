///<reference types="webpack-env" />
import { valueToLog } from './exports-string';

document.write(`Initial valueToLog: ${valueToLog}`);

if (module.hot) {
  module.hot.accept('./exports-string', () => {
    const { valueToLog } = require('./exports-string'); // original imported value doesn't update, so you need to import it again
    document.write(`HMR valueToLog: ${valueToLog}`);
  });
}
