import { leaf37, Leaf37Result } from './leaf37';
import { leaf68, Leaf68Result } from './leaf68';
import { leaf86, Leaf86Result } from './leaf86';

export interface Mid43Result {
  results: (Leaf37Result | Leaf68Result | Leaf86Result)[];
  total: number;
}

export function mid43(seed: number): Mid43Result {
  const results: (Leaf37Result | Leaf68Result | Leaf86Result)[] = [leaf37(seed + 37), leaf68(seed + 68), leaf86(seed + 86)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
