import { leaf57, Leaf57Result } from './leaf57';
import { leaf74, Leaf74Result } from './leaf74';
import { leaf158, Leaf158Result } from './leaf158';

export interface Mid79Result {
  results: (Leaf57Result | Leaf74Result | Leaf158Result)[];
  total: number;
}

export function mid79(seed: number): Mid79Result {
  const results: (Leaf57Result | Leaf74Result | Leaf158Result)[] = [leaf57(seed + 57), leaf74(seed + 74), leaf158(seed + 158)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
