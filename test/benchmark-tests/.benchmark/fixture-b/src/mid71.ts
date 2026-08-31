import { leaf3, Leaf3Result } from './leaf3';
import { leaf71, Leaf71Result } from './leaf71';
import { leaf100, Leaf100Result } from './leaf100';
import { leaf175, Leaf175Result } from './leaf175';

export interface Mid71Result {
  results: (Leaf3Result | Leaf71Result | Leaf100Result | Leaf175Result)[];
  total: number;
}

export function mid71(seed: number): Mid71Result {
  const results: (Leaf3Result | Leaf71Result | Leaf100Result | Leaf175Result)[] = [leaf3(seed + 3), leaf71(seed + 71), leaf100(seed + 100), leaf175(seed + 175)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
