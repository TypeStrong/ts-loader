import { leaf23, Leaf23Result } from './leaf23';
import { leaf58, Leaf58Result } from './leaf58';
import { leaf70, Leaf70Result } from './leaf70';
import { leaf142, Leaf142Result } from './leaf142';

export interface Mid29Result {
  results: (Leaf23Result | Leaf58Result | Leaf70Result | Leaf142Result)[];
  total: number;
}

export function mid29(seed: number): Mid29Result {
  const results: (Leaf23Result | Leaf58Result | Leaf70Result | Leaf142Result)[] = [leaf23(seed + 23), leaf58(seed + 58), leaf70(seed + 70), leaf142(seed + 142)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
