import { leaf9, Leaf9Result } from './leaf9';
import { leaf100, Leaf100Result } from './leaf100';

export interface Mid9Result {
  results: (Leaf9Result | Leaf100Result)[];
  total: number;
}

export function mid9(seed: number): Mid9Result {
  const results: (Leaf9Result | Leaf100Result)[] = [leaf9(seed + 9), leaf100(seed + 100)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
