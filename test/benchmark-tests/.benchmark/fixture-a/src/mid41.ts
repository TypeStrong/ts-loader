import { leaf56, Leaf56Result } from './leaf56';
import { leaf125, Leaf125Result } from './leaf125';

export interface Mid41Result {
  results: (Leaf56Result | Leaf125Result)[];
  total: number;
}

export function mid41(seed: number): Mid41Result {
  const results: (Leaf56Result | Leaf125Result)[] = [leaf56(seed + 56), leaf125(seed + 125)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
