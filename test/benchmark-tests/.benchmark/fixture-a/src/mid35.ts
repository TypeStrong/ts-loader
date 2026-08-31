import { leaf29, Leaf29Result } from './leaf29';
import { leaf30, Leaf30Result } from './leaf30';
import { leaf52, Leaf52Result } from './leaf52';
import { leaf100, Leaf100Result } from './leaf100';

export interface Mid35Result {
  results: (Leaf29Result | Leaf30Result | Leaf52Result | Leaf100Result)[];
  total: number;
}

export function mid35(seed: number): Mid35Result {
  const results: (Leaf29Result | Leaf30Result | Leaf52Result | Leaf100Result)[] = [leaf29(seed + 29), leaf30(seed + 30), leaf52(seed + 52), leaf100(seed + 100)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
