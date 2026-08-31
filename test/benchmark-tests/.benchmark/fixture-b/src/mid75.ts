import { leaf56, Leaf56Result } from './leaf56';
import { leaf102, Leaf102Result } from './leaf102';
import { leaf123, Leaf123Result } from './leaf123';
import { leaf145, Leaf145Result } from './leaf145';

export interface Mid75Result {
  results: (Leaf56Result | Leaf102Result | Leaf123Result | Leaf145Result)[];
  total: number;
}

export function mid75(seed: number): Mid75Result {
  const results: (Leaf56Result | Leaf102Result | Leaf123Result | Leaf145Result)[] = [leaf56(seed + 56), leaf102(seed + 102), leaf123(seed + 123), leaf145(seed + 145)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
