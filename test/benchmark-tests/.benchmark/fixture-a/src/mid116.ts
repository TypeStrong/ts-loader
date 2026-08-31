import { leaf9, Leaf9Result } from './leaf9';
import { leaf105, Leaf105Result } from './leaf105';
import { leaf145, Leaf145Result } from './leaf145';

export interface Mid116Result {
  results: (Leaf9Result | Leaf105Result | Leaf145Result)[];
  total: number;
}

export function mid116(seed: number): Mid116Result {
  const results: (Leaf9Result | Leaf105Result | Leaf145Result)[] = [leaf9(seed + 9), leaf105(seed + 105), leaf145(seed + 145)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
