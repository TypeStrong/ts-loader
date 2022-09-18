import os = require('os');

export const EOL = os.EOL;
export const CarriageReturnLineFeed = '\r\n';
export const LineFeed = '\n';

export const CarriageReturnLineFeedCode = 0;
export const LineFeedCode = 1;

export const extensionRegex = /\.[^.]+$/;
export const tsxRegex = /\.tsx$/i;
export const tsTsxRegex = /\.([cm]?ts|tsx)$/i;
export const declarationRegex = /\.d\.([cm]?ts|tsx)$/i;
export const dtsDtsxOrDtsDtsxMapRegex = /\.d\.([cm]?ts|tsx)(\.map)?$/i;
export const dtsTsTsxRegex = /(\.d)?\.([cm]?ts|tsx)$/i;
export const dtsTsTsxJsJsxRegex = /((\.d)?\.([cm]?[tj]s|[tj]sx))$/i;
export const tsTsxJsJsxRegex = /\.([cm]?[tj]s|[tj]sx)$/i;
export const jsJsx = /\.([cm]?js|jsx)$/i;
export const jsJsxMap = /\.([cm]?js|jsx)\.map$/i;
export const jsonRegex = /\.json$/i;
export const nodeModules = /node_modules/i;
