import { leaf27, Leaf27Result } from './leaf27';
import { leaf51, Leaf51Result } from './leaf51';
import { leaf124, Leaf124Result } from './leaf124';
import { leaf173, Leaf173Result } from './leaf173';

export interface Mid81Result {
  results: (Leaf27Result | Leaf51Result | Leaf124Result | Leaf173Result)[];
  total: number;
}

export function mid81(seed: number): Mid81Result {
  const results: (Leaf27Result | Leaf51Result | Leaf124Result | Leaf173Result)[] = [leaf27(seed + 27), leaf51(seed + 51), leaf124(seed + 124), leaf173(seed + 173)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
