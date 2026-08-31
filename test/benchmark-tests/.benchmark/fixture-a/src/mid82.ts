import { leaf49, Leaf49Result } from './leaf49';
import { leaf113, Leaf113Result } from './leaf113';
import { leaf138, Leaf138Result } from './leaf138';

export interface Mid82Result {
  results: (Leaf49Result | Leaf113Result | Leaf138Result)[];
  total: number;
}

export function mid82(seed: number): Mid82Result {
  const results: (Leaf49Result | Leaf113Result | Leaf138Result)[] = [leaf49(seed + 49), leaf113(seed + 113), leaf138(seed + 138)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
