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
  const bold: Colors['bold'] = Object.assign((input: string) => base.bold(input), {
    yellow: (input: string) => base.bold(base.yellow(input)),
    red: (input: string) => base.bold(base.red(input)),
    cyan: (input: string) => base.bold(base.cyan(input)),
  });

  return {
    green: base.green,
    yellow: base.yellow,
    red: base.red,
    grey: base.gray,
    cyan: base.cyan,
    bold,
  };
}

// `pc` is itself the default picocolors instance, already built once (at
// module load, using auto-detected `isColorSupported`) rather than
// recomputed - reusing it here avoids rebuilding all ~26 of its formatter
// functions on every call when the requested state happens to match it,
// which is the common case (colors enabled on a color-capable terminal).
const colorsEnabled = buildColors(pc);
let colorsDisabled: Colors | undefined;

export function createColors(loaderOptionsColors: boolean): Colors {
  if (loaderOptionsColors && pc.isColorSupported) {
    return colorsEnabled;
  }
  // Only ever one "disabled" variant needed, so build it once and reuse it -
  // there's no `enabled`-dependent state in `LoaderOptions` beyond this
  // boolean, so a single memoized instance covers every disabled call.
  return (colorsDisabled ??= buildColors(pc.createColors(false)));
}
