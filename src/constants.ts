import os = require('os');

export const EOL = os.EOL;
export const CarriageReturnLineFeed = '\r\n';
export const LineFeed = '\n';

export const CarriageReturnLineFeedCode = 0;
export const LineFeedCode = 1;

export const ScriptTargetES2015 = 2;

export const ModuleKindNone = 0;
export const ModuleKindCommonJs = 1;

export const tsTsxRegex = /\.ts(x?)$/;
export const dtsdTsxRegex = /\.d\.ts(x?)$/;
export const dtsTsTsxRegex = /(\.d)?\.ts(x?)$/;
export const tsTsxJsJsxRegex = /\.tsx?$|\.jsx?$/;
export const jsJsx = /\.js(x?)$/;
export const jsJsxMap = /\.js(x?)\.map$/;