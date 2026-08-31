import { leaf88, Leaf88Result } from './leaf88';
import { leaf142, Leaf142Result } from './leaf142';
import { leaf156, Leaf156Result } from './leaf156';

export interface Mid99Result {
  results: (Leaf88Result | Leaf142Result | Leaf156Result)[];
  total: number;
}

export function mid99(seed: number): Mid99Result {
  const results: (Leaf88Result | Leaf142Result | Leaf156Result)[] = [leaf88(seed + 88), leaf142(seed + 142), leaf156(seed + 156)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
