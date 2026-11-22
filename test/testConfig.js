'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Why a test shouldn't run, read from the optional `test.json` in its folder,
 * or undefined if it should run:
 * - `"skip": "<reason>"`: always skipped, with that reason
 * - `"minWebpack": 5`: skipped on older webpack
 * Throws if test.json is invalid.
 * @param {string} testPath the test's folder
 * @param {string} webpackVersion the installed webpack's version
 * @returns {string | undefined}
 */
function getSkipReason(testPath, webpackVersion) {
    const testConfigPath = path.join(testPath, 'test.json');
    if (!fs.existsSync(testConfigPath)) {
        return undefined;
    }
    const { minWebpack, skip } = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));
    if (minWebpack !== undefined && !(Number.isInteger(minWebpack) && minWebpack > 0)) {
        throw new Error('"minWebpack" must be a webpack major version number, e.g. 5');
    }
    if (skip !== undefined && !(typeof skip === 'string' && skip !== '')) {
        throw new Error('"skip" must be the reason the test is skipped');
    }
    if (skip !== undefined) {
        return skip;
    }
    if (minWebpack !== undefined && Number(webpackVersion.split('.')[0]) < minWebpack) {
        return 'it needs webpack ' + minWebpack + ' or later; the installed version is ' + webpackVersion;
    }
    return undefined;
}

module.exports = { getSkipReason };
