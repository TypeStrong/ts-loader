import { leaf108, Leaf108Result } from './leaf108';
import { leaf118, Leaf118Result } from './leaf118';

export interface Mid102Result {
  results: (Leaf108Result | Leaf118Result)[];
  total: number;
}

export function mid102(seed: number): Mid102Result {
  const results: (Leaf108Result | Leaf118Result)[] = [leaf108(seed + 108), leaf118(seed + 118)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
