import { leaf70, Leaf70Result } from './leaf70';
import { leaf98, Leaf98Result } from './leaf98';

export interface Mid47Result {
  results: (Leaf70Result | Leaf98Result)[];
  total: number;
}

export function mid47(seed: number): Mid47Result {
  const results: (Leaf70Result | Leaf98Result)[] = [leaf70(seed + 70), leaf98(seed + 98)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
