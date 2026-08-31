import { leaf26, Leaf26Result } from './leaf26';
import { leaf31, Leaf31Result } from './leaf31';
import { leaf99, Leaf99Result } from './leaf99';
import { leaf121, Leaf121Result } from './leaf121';

export interface Mid100Result {
  results: (Leaf26Result | Leaf31Result | Leaf99Result | Leaf121Result)[];
  total: number;
}

export function mid100(seed: number): Mid100Result {
  const results: (Leaf26Result | Leaf31Result | Leaf99Result | Leaf121Result)[] = [leaf26(seed + 26), leaf31(seed + 31), leaf99(seed + 99), leaf121(seed + 121)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
