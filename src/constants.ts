import os = require('os');

export const EOL = os.EOL;
export const dtsDtsxOrDtsDtsxMapRegex = /\.d\.([cm]?ts|tsx)(\.map)?$/i;
export const dtsTsTsxRegex = /(\.d)?\.([cm]?ts|tsx)$/i;
export const dtsTsTsxJsJsxRegex = /((\.d)?\.([cm]?[tj]s|[tj]sx))$/i;
export const tsTsxJsJsxRegex = /\.([cm]?[tj]s|[tj]sx)$/i;
export const jsJsx = /\.([cm]?js|jsx)$/i;
export const jsJsxMap = /\.([cm]?js|jsx)\.map$/i;
export const jsonRegex = /\.json$/i;
