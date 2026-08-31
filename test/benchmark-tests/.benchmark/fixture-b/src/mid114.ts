import { leaf7, Leaf7Result } from './leaf7';
import { leaf45, Leaf45Result } from './leaf45';
import { leaf90, Leaf90Result } from './leaf90';

export interface Mid114Result {
  results: (Leaf7Result | Leaf45Result | Leaf90Result)[];
  total: number;
}

export function mid114(seed: number): Mid114Result {
  const results: (Leaf7Result | Leaf45Result | Leaf90Result)[] = [leaf7(seed + 7), leaf45(seed + 45), leaf90(seed + 90)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
