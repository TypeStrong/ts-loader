import { leaf37, Leaf37Result } from './leaf37';
import { leaf88, Leaf88Result } from './leaf88';
import { leaf108, Leaf108Result } from './leaf108';
import { leaf163, Leaf163Result } from './leaf163';

export interface Mid31Result {
  results: (Leaf37Result | Leaf88Result | Leaf108Result | Leaf163Result)[];
  total: number;
}

export function mid31(seed: number): Mid31Result {
  const results: (Leaf37Result | Leaf88Result | Leaf108Result | Leaf163Result)[] = [leaf37(seed + 37), leaf88(seed + 88), leaf108(seed + 108), leaf163(seed + 163)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
