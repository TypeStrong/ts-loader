import { leaf28, Leaf28Result } from './leaf28';
import { leaf87, Leaf87Result } from './leaf87';
import { leaf121, Leaf121Result } from './leaf121';

export interface Mid110Result {
  results: (Leaf28Result | Leaf87Result | Leaf121Result)[];
  total: number;
}

export function mid110(seed: number): Mid110Result {
  const results: (Leaf28Result | Leaf87Result | Leaf121Result)[] = [leaf28(seed + 28), leaf87(seed + 87), leaf121(seed + 121)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
