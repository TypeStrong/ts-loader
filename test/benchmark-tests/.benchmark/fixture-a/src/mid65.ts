import { leaf17, Leaf17Result } from './leaf17';
import { leaf77, Leaf77Result } from './leaf77';
import { leaf90, Leaf90Result } from './leaf90';
import { leaf147, Leaf147Result } from './leaf147';

export interface Mid65Result {
  results: (Leaf17Result | Leaf77Result | Leaf90Result | Leaf147Result)[];
  total: number;
}

export function mid65(seed: number): Mid65Result {
  const results: (Leaf17Result | Leaf77Result | Leaf90Result | Leaf147Result)[] = [leaf17(seed + 17), leaf77(seed + 77), leaf90(seed + 90), leaf147(seed + 147)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
