import { leaf13, Leaf13Result } from './leaf13';
import { leaf84, Leaf84Result } from './leaf84';
import { leaf89, Leaf89Result } from './leaf89';

export interface Mid84Result {
  results: (Leaf13Result | Leaf84Result | Leaf89Result)[];
  total: number;
}

export function mid84(seed: number): Mid84Result {
  const results: (Leaf13Result | Leaf84Result | Leaf89Result)[] = [leaf13(seed + 13), leaf84(seed + 84), leaf89(seed + 89)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
