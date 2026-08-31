import { leaf8, Leaf8Result } from './leaf8';
import { leaf126, Leaf126Result } from './leaf126';

export interface Mid32Result {
  results: (Leaf8Result | Leaf126Result)[];
  total: number;
}

export function mid32(seed: number): Mid32Result {
  const results: (Leaf8Result | Leaf126Result)[] = [leaf8(seed + 8), leaf126(seed + 126)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
