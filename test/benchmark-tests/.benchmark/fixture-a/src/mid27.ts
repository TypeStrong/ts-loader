import { leaf29, Leaf29Result } from './leaf29';
import { leaf40, Leaf40Result } from './leaf40';
import { leaf74, Leaf74Result } from './leaf74';
import { leaf125, Leaf125Result } from './leaf125';

export interface Mid27Result {
  results: (Leaf29Result | Leaf40Result | Leaf74Result | Leaf125Result)[];
  total: number;
}

export function mid27(seed: number): Mid27Result {
  const results: (Leaf29Result | Leaf40Result | Leaf74Result | Leaf125Result)[] = [leaf29(seed + 29), leaf40(seed + 40), leaf74(seed + 74), leaf125(seed + 125)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
