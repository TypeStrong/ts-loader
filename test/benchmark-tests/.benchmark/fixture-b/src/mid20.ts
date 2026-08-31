import { leaf58, Leaf58Result } from './leaf58';
import { leaf107, Leaf107Result } from './leaf107';
import { leaf131, Leaf131Result } from './leaf131';

export interface Mid20Result {
  results: (Leaf58Result | Leaf107Result | Leaf131Result)[];
  total: number;
}

export function mid20(seed: number): Mid20Result {
  const results: (Leaf58Result | Leaf107Result | Leaf131Result)[] = [leaf58(seed + 58), leaf107(seed + 107), leaf131(seed + 131)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
