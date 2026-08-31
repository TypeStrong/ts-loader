import { leaf104, Leaf104Result } from './leaf104';
import { leaf178, Leaf178Result } from './leaf178';

export interface Mid95Result {
  results: (Leaf104Result | Leaf178Result)[];
  total: number;
}

export function mid95(seed: number): Mid95Result {
  const results: (Leaf104Result | Leaf178Result)[] = [leaf104(seed + 104), leaf178(seed + 178)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
