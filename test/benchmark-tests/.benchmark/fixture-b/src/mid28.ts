import { leaf37, Leaf37Result } from './leaf37';
import { leaf60, Leaf60Result } from './leaf60';
import { leaf113, Leaf113Result } from './leaf113';

export interface Mid28Result {
  results: (Leaf37Result | Leaf60Result | Leaf113Result)[];
  total: number;
}

export function mid28(seed: number): Mid28Result {
  const results: (Leaf37Result | Leaf60Result | Leaf113Result)[] = [leaf37(seed + 37), leaf60(seed + 60), leaf113(seed + 113)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
