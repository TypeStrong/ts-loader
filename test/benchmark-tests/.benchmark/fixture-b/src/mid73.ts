import { leaf169, Leaf169Result } from './leaf169';
import { leaf171, Leaf171Result } from './leaf171';

export interface Mid73Result {
  results: (Leaf169Result | Leaf171Result)[];
  total: number;
}

export function mid73(seed: number): Mid73Result {
  const results: (Leaf169Result | Leaf171Result)[] = [leaf169(seed + 169), leaf171(seed + 171)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
