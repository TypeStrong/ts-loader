import { leaf130, Leaf130Result } from './leaf130';
import { leaf158, Leaf158Result } from './leaf158';
import { leaf172, Leaf172Result } from './leaf172';

export interface Mid55Result {
  results: (Leaf130Result | Leaf158Result | Leaf172Result)[];
  total: number;
}

export function mid55(seed: number): Mid55Result {
  const results: (Leaf130Result | Leaf158Result | Leaf172Result)[] = [leaf130(seed + 130), leaf158(seed + 158), leaf172(seed + 172)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
