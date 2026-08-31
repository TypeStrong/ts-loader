import { leaf5, Leaf5Result } from './leaf5';
import { leaf49, Leaf49Result } from './leaf49';
import { leaf52, Leaf52Result } from './leaf52';
import { leaf60, Leaf60Result } from './leaf60';

export interface Mid33Result {
  results: (Leaf5Result | Leaf49Result | Leaf52Result | Leaf60Result)[];
  total: number;
}

export function mid33(seed: number): Mid33Result {
  const results: (Leaf5Result | Leaf49Result | Leaf52Result | Leaf60Result)[] = [leaf5(seed + 5), leaf49(seed + 49), leaf52(seed + 52), leaf60(seed + 60)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
