import { leaf67, Leaf67Result } from './leaf67';
import { leaf149, Leaf149Result } from './leaf149';

export interface Mid87Result {
  results: (Leaf67Result | Leaf149Result)[];
  total: number;
}

export function mid87(seed: number): Mid87Result {
  const results: (Leaf67Result | Leaf149Result)[] = [leaf67(seed + 67), leaf149(seed + 149)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
