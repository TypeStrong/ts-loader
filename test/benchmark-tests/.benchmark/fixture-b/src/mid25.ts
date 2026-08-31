import { leaf85, Leaf85Result } from './leaf85';
import { leaf147, Leaf147Result } from './leaf147';

export interface Mid25Result {
  results: (Leaf85Result | Leaf147Result)[];
  total: number;
}

export function mid25(seed: number): Mid25Result {
  const results: (Leaf85Result | Leaf147Result)[] = [leaf85(seed + 85), leaf147(seed + 147)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
