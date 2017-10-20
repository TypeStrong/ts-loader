/**
 * Given an array of files this will produce an object which contains the values for the vendor entry point
 */
function makeVendorEntry(config) {
    const packageJson = require('../../package.json');
    const vendorDependencies = Object.keys(packageJson['dependencies']);

    // config example value: 
    // {
    //     mainModules: [
    //         'core-js',
    //         'whatwg-fetch',
    //         'react-hot-loader/patch',
    //         './src/index.tsx'
    //     ],
    //     modulesToExclude: ['my-style']
    // }
    const vendorModulesMinusExclusions = vendorDependencies.filter(vendorModule =>
        config.mainModules.indexOf(vendorModule) === -1 && config.modulesToExclude.indexOf(vendorModule) === -1);

    return vendorModulesMinusExclusions;
}

exports.makeVendorEntry = makeVendorEntry;
