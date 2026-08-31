import { leaf98, Leaf98Result } from './leaf98';
import { leaf174, Leaf174Result } from './leaf174';
import { leaf177, Leaf177Result } from './leaf177';

export interface Mid77Result {
  results: (Leaf98Result | Leaf174Result | Leaf177Result)[];
  total: number;
}

export function mid77(seed: number): Mid77Result {
  const results: (Leaf98Result | Leaf174Result | Leaf177Result)[] = [leaf98(seed + 98), leaf174(seed + 174), leaf177(seed + 177)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
