import { leaf46, Leaf46Result } from './leaf46';
import { leaf50, Leaf50Result } from './leaf50';
import { leaf129, Leaf129Result } from './leaf129';

export interface Mid91Result {
  results: (Leaf46Result | Leaf50Result | Leaf129Result)[];
  total: number;
}

export function mid91(seed: number): Mid91Result {
  const results: (Leaf46Result | Leaf50Result | Leaf129Result)[] = [leaf46(seed + 46), leaf50(seed + 50), leaf129(seed + 129)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
