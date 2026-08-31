import { leaf45, Leaf45Result } from './leaf45';
import { leaf80, Leaf80Result } from './leaf80';
import { leaf87, Leaf87Result } from './leaf87';
import { leaf89, Leaf89Result } from './leaf89';

export interface Mid112Result {
  results: (Leaf45Result | Leaf80Result | Leaf87Result | Leaf89Result)[];
  total: number;
}

export function mid112(seed: number): Mid112Result {
  const results: (Leaf45Result | Leaf80Result | Leaf87Result | Leaf89Result)[] = [leaf45(seed + 45), leaf80(seed + 80), leaf87(seed + 87), leaf89(seed + 89)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
