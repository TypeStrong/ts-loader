import { leaf32, Leaf32Result } from './leaf32';
import { leaf124, Leaf124Result } from './leaf124';

export interface Mid119Result {
  results: (Leaf32Result | Leaf124Result)[];
  total: number;
}

export function mid119(seed: number): Mid119Result {
  const results: (Leaf32Result | Leaf124Result)[] = [leaf32(seed + 32), leaf124(seed + 124)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
