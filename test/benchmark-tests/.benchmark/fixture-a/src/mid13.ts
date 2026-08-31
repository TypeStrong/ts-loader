import { leaf118, Leaf118Result } from './leaf118';
import { leaf122, Leaf122Result } from './leaf122';

export interface Mid13Result {
  results: (Leaf118Result | Leaf122Result)[];
  total: number;
}

export function mid13(seed: number): Mid13Result {
  const results: (Leaf118Result | Leaf122Result)[] = [leaf118(seed + 118), leaf122(seed + 122)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
