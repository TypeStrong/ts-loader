import { leaf95, Leaf95Result } from './leaf95';
import { leaf111, Leaf111Result } from './leaf111';
import { leaf150, Leaf150Result } from './leaf150';

export interface Mid80Result {
  results: (Leaf95Result | Leaf111Result | Leaf150Result)[];
  total: number;
}

export function mid80(seed: number): Mid80Result {
  const results: (Leaf95Result | Leaf111Result | Leaf150Result)[] = [leaf95(seed + 95), leaf111(seed + 111), leaf150(seed + 150)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
