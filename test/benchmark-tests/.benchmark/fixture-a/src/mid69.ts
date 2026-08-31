import { leaf14, Leaf14Result } from './leaf14';
import { leaf17, Leaf17Result } from './leaf17';
import { leaf31, Leaf31Result } from './leaf31';

export interface Mid69Result {
  results: (Leaf14Result | Leaf17Result | Leaf31Result)[];
  total: number;
}

export function mid69(seed: number): Mid69Result {
  const results: (Leaf14Result | Leaf17Result | Leaf31Result)[] = [leaf14(seed + 14), leaf17(seed + 17), leaf31(seed + 31)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
