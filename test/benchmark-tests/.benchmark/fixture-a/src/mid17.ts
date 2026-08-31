import { leaf32, Leaf32Result } from './leaf32';
import { leaf50, Leaf50Result } from './leaf50';
import { leaf127, Leaf127Result } from './leaf127';
import { leaf168, Leaf168Result } from './leaf168';

export interface Mid17Result {
  results: (Leaf32Result | Leaf50Result | Leaf127Result | Leaf168Result)[];
  total: number;
}

export function mid17(seed: number): Mid17Result {
  const results: (Leaf32Result | Leaf50Result | Leaf127Result | Leaf168Result)[] = [leaf32(seed + 32), leaf50(seed + 50), leaf127(seed + 127), leaf168(seed + 168)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
