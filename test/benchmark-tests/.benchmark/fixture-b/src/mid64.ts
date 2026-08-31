import { leaf12, Leaf12Result } from './leaf12';
import { leaf169, Leaf169Result } from './leaf169';

export interface Mid64Result {
  results: (Leaf12Result | Leaf169Result)[];
  total: number;
}

export function mid64(seed: number): Mid64Result {
  const results: (Leaf12Result | Leaf169Result)[] = [leaf12(seed + 12), leaf169(seed + 169)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
