import { leaf2, Leaf2Result } from './leaf2';
import { leaf19, Leaf19Result } from './leaf19';
import { leaf24, Leaf24Result } from './leaf24';
import { leaf64, Leaf64Result } from './leaf64';

export interface Mid15Result {
  results: (Leaf2Result | Leaf19Result | Leaf24Result | Leaf64Result)[];
  total: number;
}

export function mid15(seed: number): Mid15Result {
  const results: (Leaf2Result | Leaf19Result | Leaf24Result | Leaf64Result)[] = [leaf2(seed + 2), leaf19(seed + 19), leaf24(seed + 24), leaf64(seed + 64)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
