import { leaf1, Leaf1Result } from './leaf1';
import { leaf66, Leaf66Result } from './leaf66';
import { leaf114, Leaf114Result } from './leaf114';
import { leaf132, Leaf132Result } from './leaf132';

export interface Mid30Result {
  results: (Leaf1Result | Leaf66Result | Leaf114Result | Leaf132Result)[];
  total: number;
}

export function mid30(seed: number): Mid30Result {
  const results: (Leaf1Result | Leaf66Result | Leaf114Result | Leaf132Result)[] = [leaf1(seed + 1), leaf66(seed + 66), leaf114(seed + 114), leaf132(seed + 132)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
