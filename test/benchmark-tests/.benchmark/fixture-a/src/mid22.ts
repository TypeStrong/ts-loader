import { leaf77, Leaf77Result } from './leaf77';
import { leaf98, Leaf98Result } from './leaf98';
import { leaf160, Leaf160Result } from './leaf160';
import { leaf178, Leaf178Result } from './leaf178';

export interface Mid22Result {
  results: (Leaf77Result | Leaf98Result | Leaf160Result | Leaf178Result)[];
  total: number;
}

export function mid22(seed: number): Mid22Result {
  const results: (Leaf77Result | Leaf98Result | Leaf160Result | Leaf178Result)[] = [leaf77(seed + 77), leaf98(seed + 98), leaf160(seed + 160), leaf178(seed + 178)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
