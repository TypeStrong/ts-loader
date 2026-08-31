import { leaf39, Leaf39Result } from './leaf39';
import { leaf120, Leaf120Result } from './leaf120';

export interface Mid40Result {
  results: (Leaf39Result | Leaf120Result)[];
  total: number;
}

export function mid40(seed: number): Mid40Result {
  const results: (Leaf39Result | Leaf120Result)[] = [leaf39(seed + 39), leaf120(seed + 120)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
