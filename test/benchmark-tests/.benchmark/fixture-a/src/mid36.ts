import { leaf75, Leaf75Result } from './leaf75';
import { leaf78, Leaf78Result } from './leaf78';
import { leaf123, Leaf123Result } from './leaf123';

export interface Mid36Result {
  results: (Leaf75Result | Leaf78Result | Leaf123Result)[];
  total: number;
}

export function mid36(seed: number): Mid36Result {
  const results: (Leaf75Result | Leaf78Result | Leaf123Result)[] = [leaf75(seed + 75), leaf78(seed + 78), leaf123(seed + 123)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
