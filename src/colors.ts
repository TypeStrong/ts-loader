import type { InspectColor } from 'node:util';
import { styleText } from 'node:util';

export type ColorFn = (input: string) => string;

export interface Colors {
  green: ColorFn;
  yellow: ColorFn;
  red: ColorFn;
  grey: ColorFn;
  cyan: ColorFn;
  bold: ColorFn & {
    yellow: ColorFn;
    red: ColorFn;
    cyan: ColorFn;
  };
}

/**
 * `styleText` itself decides, per call, whether `process.stdout` actually
 * supports color (TTY-ness, NO_COLOR, FORCE_COLOR, CI, etc.) - so there's no
 * separate "is color supported" check to bake in here, unlike chalk/
 * picocolors: this only needs to gate on the loader's own `colors` option.
 */
function makeColorFn(format: InspectColor | readonly InspectColor[]): ColorFn {
  return input => styleText(format, input);
}

const enabledColors: Colors = {
  green: makeColorFn('green'),
  yellow: makeColorFn('yellow'),
  red: makeColorFn('red'),
  grey: makeColorFn('gray'),
  cyan: makeColorFn('cyan'),
  bold: Object.assign(makeColorFn('bold'), {
    yellow: makeColorFn(['bold', 'yellow']),
    red: makeColorFn(['bold', 'red']),
    cyan: makeColorFn(['bold', 'cyan']),
  }),
};

const disabledColorFn: ColorFn = input => input;

const disabledColors: Colors = {
  green: disabledColorFn,
  yellow: disabledColorFn,
  red: disabledColorFn,
  grey: disabledColorFn,
  cyan: disabledColorFn,
  bold: Object.assign(disabledColorFn, {
    yellow: disabledColorFn,
    red: disabledColorFn,
    cyan: disabledColorFn,
  }),
};

export function createColors(loaderOptionsColors: boolean): Colors {
  return loaderOptionsColors ? enabledColors : disabledColors;
}
