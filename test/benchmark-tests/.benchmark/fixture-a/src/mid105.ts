import { leaf58, Leaf58Result } from './leaf58';
import { leaf128, Leaf128Result } from './leaf128';

export interface Mid105Result {
  results: (Leaf58Result | Leaf128Result)[];
  total: number;
}

export function mid105(seed: number): Mid105Result {
  const results: (Leaf58Result | Leaf128Result)[] = [leaf58(seed + 58), leaf128(seed + 128)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
