import { leaf75, Leaf75Result } from './leaf75';
import { leaf79, Leaf79Result } from './leaf79';
import { leaf110, Leaf110Result } from './leaf110';
import { leaf121, Leaf121Result } from './leaf121';

export interface Mid85Result {
  results: (Leaf75Result | Leaf79Result | Leaf110Result | Leaf121Result)[];
  total: number;
}

export function mid85(seed: number): Mid85Result {
  const results: (Leaf75Result | Leaf79Result | Leaf110Result | Leaf121Result)[] = [leaf75(seed + 75), leaf79(seed + 79), leaf110(seed + 110), leaf121(seed + 121)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
