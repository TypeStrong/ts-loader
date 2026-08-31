import { leaf14, Leaf14Result } from './leaf14';
import { leaf139, Leaf139Result } from './leaf139';

export interface Mid98Result {
  results: (Leaf14Result | Leaf139Result)[];
  total: number;
}

export function mid98(seed: number): Mid98Result {
  const results: (Leaf14Result | Leaf139Result)[] = [leaf14(seed + 14), leaf139(seed + 139)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
