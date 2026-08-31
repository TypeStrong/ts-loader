import { leaf26, Leaf26Result } from './leaf26';
import { leaf90, Leaf90Result } from './leaf90';

export interface Mid61Result {
  results: (Leaf26Result | Leaf90Result)[];
  total: number;
}

export function mid61(seed: number): Mid61Result {
  const results: (Leaf26Result | Leaf90Result)[] = [leaf26(seed + 26), leaf90(seed + 90)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
