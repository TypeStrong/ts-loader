import { leaf12, Leaf12Result } from './leaf12';
import { leaf30, Leaf30Result } from './leaf30';

export interface Mid49Result {
  results: (Leaf12Result | Leaf30Result)[];
  total: number;
}

export function mid49(seed: number): Mid49Result {
  const results: (Leaf12Result | Leaf30Result)[] = [leaf12(seed + 12), leaf30(seed + 30)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
