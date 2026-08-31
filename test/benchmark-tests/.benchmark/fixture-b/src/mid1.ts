import { leaf49, Leaf49Result } from './leaf49';
import { leaf94, Leaf94Result } from './leaf94';

export interface Mid1Result {
  results: (Leaf49Result | Leaf94Result)[];
  total: number;
}

export function mid1(seed: number): Mid1Result {
  const results: (Leaf49Result | Leaf94Result)[] = [leaf49(seed + 49), leaf94(seed + 94)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
