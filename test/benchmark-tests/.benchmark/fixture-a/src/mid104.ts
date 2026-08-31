import { leaf8, Leaf8Result } from './leaf8';
import { leaf51, Leaf51Result } from './leaf51';
import { leaf104, Leaf104Result } from './leaf104';
import { leaf172, Leaf172Result } from './leaf172';

export interface Mid104Result {
  results: (Leaf8Result | Leaf51Result | Leaf104Result | Leaf172Result)[];
  total: number;
}

export function mid104(seed: number): Mid104Result {
  const results: (Leaf8Result | Leaf51Result | Leaf104Result | Leaf172Result)[] = [leaf8(seed + 8), leaf51(seed + 51), leaf104(seed + 104), leaf172(seed + 172)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
