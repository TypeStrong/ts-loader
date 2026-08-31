import { leaf10, Leaf10Result } from './leaf10';
import { leaf20, Leaf20Result } from './leaf20';
import { leaf124, Leaf124Result } from './leaf124';
import { leaf165, Leaf165Result } from './leaf165';

export interface Mid93Result {
  results: (Leaf10Result | Leaf20Result | Leaf124Result | Leaf165Result)[];
  total: number;
}

export function mid93(seed: number): Mid93Result {
  const results: (Leaf10Result | Leaf20Result | Leaf124Result | Leaf165Result)[] = [leaf10(seed + 10), leaf20(seed + 20), leaf124(seed + 124), leaf165(seed + 165)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
