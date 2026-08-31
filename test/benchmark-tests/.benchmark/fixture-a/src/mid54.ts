import { leaf3, Leaf3Result } from './leaf3';
import { leaf15, Leaf15Result } from './leaf15';
import { leaf27, Leaf27Result } from './leaf27';
import { leaf65, Leaf65Result } from './leaf65';

export interface Mid54Result {
  results: (Leaf3Result | Leaf15Result | Leaf27Result | Leaf65Result)[];
  total: number;
}

export function mid54(seed: number): Mid54Result {
  const results: (Leaf3Result | Leaf15Result | Leaf27Result | Leaf65Result)[] = [leaf3(seed + 3), leaf15(seed + 15), leaf27(seed + 27), leaf65(seed + 65)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
