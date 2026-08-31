import { leaf98, Leaf98Result } from './leaf98';
import { leaf143, Leaf143Result } from './leaf143';
import { leaf144, Leaf144Result } from './leaf144';

export interface Mid68Result {
  results: (Leaf98Result | Leaf143Result | Leaf144Result)[];
  total: number;
}

export function mid68(seed: number): Mid68Result {
  const results: (Leaf98Result | Leaf143Result | Leaf144Result)[] = [leaf98(seed + 98), leaf143(seed + 143), leaf144(seed + 144)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
