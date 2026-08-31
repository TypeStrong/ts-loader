import { leaf19, Leaf19Result } from './leaf19';
import { leaf87, Leaf87Result } from './leaf87';
import { leaf106, Leaf106Result } from './leaf106';

export interface Mid92Result {
  results: (Leaf19Result | Leaf87Result | Leaf106Result)[];
  total: number;
}

export function mid92(seed: number): Mid92Result {
  const results: (Leaf19Result | Leaf87Result | Leaf106Result)[] = [leaf19(seed + 19), leaf87(seed + 87), leaf106(seed + 106)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
