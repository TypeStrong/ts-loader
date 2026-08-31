import { leaf80, Leaf80Result } from './leaf80';
import { leaf120, Leaf120Result } from './leaf120';
import { leaf153, Leaf153Result } from './leaf153';

export interface Mid0Result {
  results: (Leaf80Result | Leaf120Result | Leaf153Result)[];
  total: number;
}

export function mid0(seed: number): Mid0Result {
  const results: (Leaf80Result | Leaf120Result | Leaf153Result)[] = [leaf80(seed + 80), leaf120(seed + 120), leaf153(seed + 153)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
