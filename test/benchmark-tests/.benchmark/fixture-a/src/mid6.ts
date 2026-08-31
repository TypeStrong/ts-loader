import { leaf11, Leaf11Result } from './leaf11';
import { leaf33, Leaf33Result } from './leaf33';

export interface Mid6Result {
  results: (Leaf11Result | Leaf33Result)[];
  total: number;
}

export function mid6(seed: number): Mid6Result {
  const results: (Leaf11Result | Leaf33Result)[] = [leaf11(seed + 11), leaf33(seed + 33)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
