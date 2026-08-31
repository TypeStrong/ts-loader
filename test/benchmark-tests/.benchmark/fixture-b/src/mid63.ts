import { leaf0, Leaf0Result } from './leaf0';
import { leaf24, Leaf24Result } from './leaf24';
import { leaf78, Leaf78Result } from './leaf78';

export interface Mid63Result {
  results: (Leaf0Result | Leaf24Result | Leaf78Result)[];
  total: number;
}

export function mid63(seed: number): Mid63Result {
  const results: (Leaf0Result | Leaf24Result | Leaf78Result)[] = [leaf0(seed + 0), leaf24(seed + 24), leaf78(seed + 78)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
