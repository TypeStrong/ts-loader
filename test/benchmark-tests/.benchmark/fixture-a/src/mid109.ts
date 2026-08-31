import { leaf84, Leaf84Result } from './leaf84';
import { leaf91, Leaf91Result } from './leaf91';

export interface Mid109Result {
  results: (Leaf84Result | Leaf91Result)[];
  total: number;
}

export function mid109(seed: number): Mid109Result {
  const results: (Leaf84Result | Leaf91Result)[] = [leaf84(seed + 84), leaf91(seed + 91)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
