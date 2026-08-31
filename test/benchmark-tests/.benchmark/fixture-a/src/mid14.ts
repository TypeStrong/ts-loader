import { leaf15, Leaf15Result } from './leaf15';
import { leaf77, Leaf77Result } from './leaf77';
import { leaf167, Leaf167Result } from './leaf167';
import { leaf169, Leaf169Result } from './leaf169';

export interface Mid14Result {
  results: (Leaf15Result | Leaf77Result | Leaf167Result | Leaf169Result)[];
  total: number;
}

export function mid14(seed: number): Mid14Result {
  const results: (Leaf15Result | Leaf77Result | Leaf167Result | Leaf169Result)[] = [leaf15(seed + 15), leaf77(seed + 77), leaf167(seed + 167), leaf169(seed + 169)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
