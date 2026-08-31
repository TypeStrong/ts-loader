import { leaf32, Leaf32Result } from './leaf32';
import { leaf175, Leaf175Result } from './leaf175';

export interface Mid26Result {
  results: (Leaf32Result | Leaf175Result)[];
  total: number;
}

export function mid26(seed: number): Mid26Result {
  const results: (Leaf32Result | Leaf175Result)[] = [leaf32(seed + 32), leaf175(seed + 175)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
