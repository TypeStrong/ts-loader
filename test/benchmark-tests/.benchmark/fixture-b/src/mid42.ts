import { leaf7, Leaf7Result } from './leaf7';
import { leaf56, Leaf56Result } from './leaf56';

export interface Mid42Result {
  results: (Leaf7Result | Leaf56Result)[];
  total: number;
}

export function mid42(seed: number): Mid42Result {
  const results: (Leaf7Result | Leaf56Result)[] = [leaf7(seed + 7), leaf56(seed + 56)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
