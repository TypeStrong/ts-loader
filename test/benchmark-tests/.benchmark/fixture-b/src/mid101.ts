import { leaf43, Leaf43Result } from './leaf43';
import { leaf138, Leaf138Result } from './leaf138';

export interface Mid101Result {
  results: (Leaf43Result | Leaf138Result)[];
  total: number;
}

export function mid101(seed: number): Mid101Result {
  const results: (Leaf43Result | Leaf138Result)[] = [leaf43(seed + 43), leaf138(seed + 138)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
