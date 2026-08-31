import { leaf65, Leaf65Result } from './leaf65';
import { leaf155, Leaf155Result } from './leaf155';

export interface Mid113Result {
  results: (Leaf65Result | Leaf155Result)[];
  total: number;
}

export function mid113(seed: number): Mid113Result {
  const results: (Leaf65Result | Leaf155Result)[] = [leaf65(seed + 65), leaf155(seed + 155)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
