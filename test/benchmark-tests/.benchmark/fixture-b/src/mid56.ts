import { leaf26, Leaf26Result } from './leaf26';
import { leaf49, Leaf49Result } from './leaf49';
import { leaf127, Leaf127Result } from './leaf127';

export interface Mid56Result {
  results: (Leaf26Result | Leaf49Result | Leaf127Result)[];
  total: number;
}

export function mid56(seed: number): Mid56Result {
  const results: (Leaf26Result | Leaf49Result | Leaf127Result)[] = [leaf26(seed + 26), leaf49(seed + 49), leaf127(seed + 127)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
