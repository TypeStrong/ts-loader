import { leaf0, Leaf0Result } from './leaf0';
import { leaf84, Leaf84Result } from './leaf84';
import { leaf109, Leaf109Result } from './leaf109';
import { leaf150, Leaf150Result } from './leaf150';

export interface Mid4Result {
  results: (Leaf0Result | Leaf84Result | Leaf109Result | Leaf150Result)[];
  total: number;
}

export function mid4(seed: number): Mid4Result {
  const results: (Leaf0Result | Leaf84Result | Leaf109Result | Leaf150Result)[] = [leaf0(seed + 0), leaf84(seed + 84), leaf109(seed + 109), leaf150(seed + 150)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
