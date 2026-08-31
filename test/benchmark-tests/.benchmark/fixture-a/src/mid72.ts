import { leaf51, Leaf51Result } from './leaf51';
import { leaf96, Leaf96Result } from './leaf96';
import { leaf149, Leaf149Result } from './leaf149';

export interface Mid72Result {
  results: (Leaf51Result | Leaf96Result | Leaf149Result)[];
  total: number;
}

export function mid72(seed: number): Mid72Result {
  const results: (Leaf51Result | Leaf96Result | Leaf149Result)[] = [leaf51(seed + 51), leaf96(seed + 96), leaf149(seed + 149)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
