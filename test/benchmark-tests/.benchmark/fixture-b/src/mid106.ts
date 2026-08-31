import { leaf32, Leaf32Result } from './leaf32';
import { leaf45, Leaf45Result } from './leaf45';
import { leaf82, Leaf82Result } from './leaf82';
import { leaf155, Leaf155Result } from './leaf155';

export interface Mid106Result {
  results: (Leaf32Result | Leaf45Result | Leaf82Result | Leaf155Result)[];
  total: number;
}

export function mid106(seed: number): Mid106Result {
  const results: (Leaf32Result | Leaf45Result | Leaf82Result | Leaf155Result)[] = [leaf32(seed + 32), leaf45(seed + 45), leaf82(seed + 82), leaf155(seed + 155)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
