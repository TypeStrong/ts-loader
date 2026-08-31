import { leaf18, Leaf18Result } from './leaf18';
import { leaf125, Leaf125Result } from './leaf125';

export interface Mid23Result {
  results: (Leaf18Result | Leaf125Result)[];
  total: number;
}

export function mid23(seed: number): Mid23Result {
  const results: (Leaf18Result | Leaf125Result)[] = [leaf18(seed + 18), leaf125(seed + 125)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
