import { leaf59, Leaf59Result } from './leaf59';
import { leaf76, Leaf76Result } from './leaf76';
import { leaf82, Leaf82Result } from './leaf82';

export interface Mid60Result {
  results: (Leaf59Result | Leaf76Result | Leaf82Result)[];
  total: number;
}

export function mid60(seed: number): Mid60Result {
  const results: (Leaf59Result | Leaf76Result | Leaf82Result)[] = [leaf59(seed + 59), leaf76(seed + 76), leaf82(seed + 82)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
