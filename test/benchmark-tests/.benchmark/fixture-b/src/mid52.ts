import { leaf80, Leaf80Result } from './leaf80';
import { leaf122, Leaf122Result } from './leaf122';
import { leaf158, Leaf158Result } from './leaf158';

export interface Mid52Result {
  results: (Leaf80Result | Leaf122Result | Leaf158Result)[];
  total: number;
}

export function mid52(seed: number): Mid52Result {
  const results: (Leaf80Result | Leaf122Result | Leaf158Result)[] = [leaf80(seed + 80), leaf122(seed + 122), leaf158(seed + 158)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
