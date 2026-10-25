import * as pc from 'picocolors';

interface ColorFn {
  (input: string): string;
}

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

type PicocolorsInstance = ReturnType<typeof pc.createColors>;

function buildColors(base: PicocolorsInstance): Colors {
  const bold: Colors['bold'] = Object.assign(
    (input: string) => base.bold(input),
    {
      yellow: (input: string) => base.bold(base.yellow(input)),
      red: (input: string) => base.bold(base.red(input)),
      cyan: (input: string) => base.bold(base.cyan(input)),
    },
  );

  return {
    green: base.green,
    yellow: base.yellow,
    red: base.red,
    grey: base.gray,
    cyan: base.cyan,
    bold,
  };
}

// Both variants are built once and shared.
const colorsEnabled = buildColors(pc);
let colorsDisabled: Colors | undefined;

export function createColors(loaderOptionsColors: boolean): Colors {
  if (loaderOptionsColors && pc.isColorSupported) {
    return colorsEnabled;
  }
  return (colorsDisabled ??= buildColors(pc.createColors(false)));
}
