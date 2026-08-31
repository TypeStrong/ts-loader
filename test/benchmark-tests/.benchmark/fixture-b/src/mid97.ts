import { leaf36, Leaf36Result } from './leaf36';
import { leaf67, Leaf67Result } from './leaf67';
import { leaf90, Leaf90Result } from './leaf90';
import { leaf141, Leaf141Result } from './leaf141';

export interface Mid97Result {
  results: (Leaf36Result | Leaf67Result | Leaf90Result | Leaf141Result)[];
  total: number;
}

export function mid97(seed: number): Mid97Result {
  const results: (Leaf36Result | Leaf67Result | Leaf90Result | Leaf141Result)[] = [leaf36(seed + 36), leaf67(seed + 67), leaf90(seed + 90), leaf141(seed + 141)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
