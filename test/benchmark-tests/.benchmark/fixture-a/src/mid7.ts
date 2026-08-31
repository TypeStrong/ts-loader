import { leaf4, Leaf4Result } from './leaf4';
import { leaf31, Leaf31Result } from './leaf31';
import { leaf95, Leaf95Result } from './leaf95';
import { leaf151, Leaf151Result } from './leaf151';

export interface Mid7Result {
  results: (Leaf4Result | Leaf31Result | Leaf95Result | Leaf151Result)[];
  total: number;
}

export function mid7(seed: number): Mid7Result {
  const results: (Leaf4Result | Leaf31Result | Leaf95Result | Leaf151Result)[] = [leaf4(seed + 4), leaf31(seed + 31), leaf95(seed + 95), leaf151(seed + 151)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
