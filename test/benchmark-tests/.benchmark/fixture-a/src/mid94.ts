import { leaf43, Leaf43Result } from './leaf43';
import { leaf61, Leaf61Result } from './leaf61';

export interface Mid94Result {
  results: (Leaf43Result | Leaf61Result)[];
  total: number;
}

export function mid94(seed: number): Mid94Result {
  const results: (Leaf43Result | Leaf61Result)[] = [leaf43(seed + 43), leaf61(seed + 61)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
