import { leaf53, Leaf53Result } from './leaf53';
import { leaf58, Leaf58Result } from './leaf58';

export interface Mid39Result {
  results: (Leaf53Result | Leaf58Result)[];
  total: number;
}

export function mid39(seed: number): Mid39Result {
  const results: (Leaf53Result | Leaf58Result)[] = [leaf53(seed + 53), leaf58(seed + 58)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
