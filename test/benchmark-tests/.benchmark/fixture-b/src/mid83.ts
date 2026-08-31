import { leaf33, Leaf33Result } from './leaf33';
import { leaf128, Leaf128Result } from './leaf128';
import { leaf152, Leaf152Result } from './leaf152';
import { leaf162, Leaf162Result } from './leaf162';

export interface Mid83Result {
  results: (Leaf33Result | Leaf128Result | Leaf152Result | Leaf162Result)[];
  total: number;
}

export function mid83(seed: number): Mid83Result {
  const results: (Leaf33Result | Leaf128Result | Leaf152Result | Leaf162Result)[] = [leaf33(seed + 33), leaf128(seed + 128), leaf152(seed + 152), leaf162(seed + 162)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
