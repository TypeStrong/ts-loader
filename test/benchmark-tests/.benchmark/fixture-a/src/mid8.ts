import { leaf57, Leaf57Result } from './leaf57';
import { leaf80, Leaf80Result } from './leaf80';
import { leaf145, Leaf145Result } from './leaf145';

export interface Mid8Result {
  results: (Leaf57Result | Leaf80Result | Leaf145Result)[];
  total: number;
}

export function mid8(seed: number): Mid8Result {
  const results: (Leaf57Result | Leaf80Result | Leaf145Result)[] = [leaf57(seed + 57), leaf80(seed + 80), leaf145(seed + 145)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
