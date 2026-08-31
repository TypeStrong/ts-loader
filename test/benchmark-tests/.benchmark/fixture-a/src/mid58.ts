import { leaf102, Leaf102Result } from './leaf102';
import { leaf128, Leaf128Result } from './leaf128';
import { leaf142, Leaf142Result } from './leaf142';

export interface Mid58Result {
  results: (Leaf102Result | Leaf128Result | Leaf142Result)[];
  total: number;
}

export function mid58(seed: number): Mid58Result {
  const results: (Leaf102Result | Leaf128Result | Leaf142Result)[] = [leaf102(seed + 102), leaf128(seed + 128), leaf142(seed + 142)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
