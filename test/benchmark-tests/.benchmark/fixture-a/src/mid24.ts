import { leaf141, Leaf141Result } from './leaf141';
import { leaf162, Leaf162Result } from './leaf162';

export interface Mid24Result {
  results: (Leaf141Result | Leaf162Result)[];
  total: number;
}

export function mid24(seed: number): Mid24Result {
  const results: (Leaf141Result | Leaf162Result)[] = [leaf141(seed + 141), leaf162(seed + 162)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
