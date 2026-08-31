import { leaf41, Leaf41Result } from './leaf41';
import { leaf66, Leaf66Result } from './leaf66';

export interface Mid66Result {
  results: (Leaf41Result | Leaf66Result)[];
  total: number;
}

export function mid66(seed: number): Mid66Result {
  const results: (Leaf41Result | Leaf66Result)[] = [leaf41(seed + 41), leaf66(seed + 66)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
