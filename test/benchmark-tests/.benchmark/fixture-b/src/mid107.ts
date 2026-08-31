import { leaf33, Leaf33Result } from './leaf33';
import { leaf91, Leaf91Result } from './leaf91';
import { leaf153, Leaf153Result } from './leaf153';

export interface Mid107Result {
  results: (Leaf33Result | Leaf91Result | Leaf153Result)[];
  total: number;
}

export function mid107(seed: number): Mid107Result {
  const results: (Leaf33Result | Leaf91Result | Leaf153Result)[] = [leaf33(seed + 33), leaf91(seed + 91), leaf153(seed + 153)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
