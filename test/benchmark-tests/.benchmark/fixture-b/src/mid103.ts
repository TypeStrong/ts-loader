import { leaf36, Leaf36Result } from './leaf36';
import { leaf93, Leaf93Result } from './leaf93';
import { leaf165, Leaf165Result } from './leaf165';

export interface Mid103Result {
  results: (Leaf36Result | Leaf93Result | Leaf165Result)[];
  total: number;
}

export function mid103(seed: number): Mid103Result {
  const results: (Leaf36Result | Leaf93Result | Leaf165Result)[] = [leaf36(seed + 36), leaf93(seed + 93), leaf165(seed + 165)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
