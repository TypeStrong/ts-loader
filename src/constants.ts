import os = require('os');

export const EOL = os.EOL;
export const CarriageReturnLineFeed = '\r\n';
export const LineFeed = '\n';

export const CarriageReturnLineFeedCode = 0;
export const LineFeedCode = 1;

export const extensionRegex = /\.[^.]+$/;
export const tsxRegex = /\.tsx$/i;
export const tsTsxRegex = /\.ts(x?)$/i;
export const dtsDtsxOrDtsDtsxMapRegex = /\.d\.ts(x?)(\.map)?$/i;
export const dtsTsTsxRegex = /(\.d)?\.ts(x?)$/i;
export const dtsTsTsxJsJsxRegex = /((\.d)?\.ts(x?)|js(x?))$/i;
export const tsTsxJsJsxRegex = /\.tsx?$|\.jsx?$/i;
export const jsJsx = /\.js(x?)$/i;
export const jsJsxMap = /\.js(x?)\.map$/i;
export const jsonRegex = /\.json$/i;
export const nodeModules = /node_modules/i;
