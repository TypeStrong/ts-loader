import { leaf59, Leaf59Result } from './leaf59';
import { leaf112, Leaf112Result } from './leaf112';
import { leaf168, Leaf168Result } from './leaf168';

export interface Mid53Result {
  results: (Leaf59Result | Leaf112Result | Leaf168Result)[];
  total: number;
}

export function mid53(seed: number): Mid53Result {
  const results: (Leaf59Result | Leaf112Result | Leaf168Result)[] = [leaf59(seed + 59), leaf112(seed + 112), leaf168(seed + 168)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
