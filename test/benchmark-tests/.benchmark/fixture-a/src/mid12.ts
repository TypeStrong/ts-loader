import { leaf36, Leaf36Result } from './leaf36';
import { leaf51, Leaf51Result } from './leaf51';
import { leaf52, Leaf52Result } from './leaf52';

export interface Mid12Result {
  results: (Leaf36Result | Leaf51Result | Leaf52Result)[];
  total: number;
}

export function mid12(seed: number): Mid12Result {
  const results: (Leaf36Result | Leaf51Result | Leaf52Result)[] = [leaf36(seed + 36), leaf51(seed + 51), leaf52(seed + 52)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
