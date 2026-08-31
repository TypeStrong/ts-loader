import { leaf85, Leaf85Result } from './leaf85';
import { leaf86, Leaf86Result } from './leaf86';
import { leaf92, Leaf92Result } from './leaf92';

export interface Mid117Result {
  results: (Leaf85Result | Leaf86Result | Leaf92Result)[];
  total: number;
}

export function mid117(seed: number): Mid117Result {
  const results: (Leaf85Result | Leaf86Result | Leaf92Result)[] = [leaf85(seed + 85), leaf86(seed + 86), leaf92(seed + 92)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
