import { leaf80, Leaf80Result } from './leaf80';
import { leaf151, Leaf151Result } from './leaf151';

export interface Mid21Result {
  results: (Leaf80Result | Leaf151Result)[];
  total: number;
}

export function mid21(seed: number): Mid21Result {
  const results: (Leaf80Result | Leaf151Result)[] = [leaf80(seed + 80), leaf151(seed + 151)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
