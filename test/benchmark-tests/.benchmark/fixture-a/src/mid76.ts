import { leaf98, Leaf98Result } from './leaf98';
import { leaf123, Leaf123Result } from './leaf123';
import { leaf135, Leaf135Result } from './leaf135';

export interface Mid76Result {
  results: (Leaf98Result | Leaf123Result | Leaf135Result)[];
  total: number;
}

export function mid76(seed: number): Mid76Result {
  const results: (Leaf98Result | Leaf123Result | Leaf135Result)[] = [leaf98(seed + 98), leaf123(seed + 123), leaf135(seed + 135)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
