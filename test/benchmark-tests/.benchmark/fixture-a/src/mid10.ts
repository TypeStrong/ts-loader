import { leaf37, Leaf37Result } from './leaf37';
import { leaf44, Leaf44Result } from './leaf44';
import { leaf116, Leaf116Result } from './leaf116';

export interface Mid10Result {
  results: (Leaf37Result | Leaf44Result | Leaf116Result)[];
  total: number;
}

export function mid10(seed: number): Mid10Result {
  const results: (Leaf37Result | Leaf44Result | Leaf116Result)[] = [leaf37(seed + 37), leaf44(seed + 44), leaf116(seed + 116)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
