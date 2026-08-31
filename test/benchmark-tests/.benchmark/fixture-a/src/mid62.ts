import { leaf95, Leaf95Result } from './leaf95';
import { leaf98, Leaf98Result } from './leaf98';

export interface Mid62Result {
  results: (Leaf95Result | Leaf98Result)[];
  total: number;
}

export function mid62(seed: number): Mid62Result {
  const results: (Leaf95Result | Leaf98Result)[] = [leaf95(seed + 95), leaf98(seed + 98)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
