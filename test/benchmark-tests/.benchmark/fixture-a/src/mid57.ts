import { leaf8, Leaf8Result } from './leaf8';
import { leaf52, Leaf52Result } from './leaf52';

export interface Mid57Result {
  results: (Leaf8Result | Leaf52Result)[];
  total: number;
}

export function mid57(seed: number): Mid57Result {
  const results: (Leaf8Result | Leaf52Result)[] = [leaf8(seed + 8), leaf52(seed + 52)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
