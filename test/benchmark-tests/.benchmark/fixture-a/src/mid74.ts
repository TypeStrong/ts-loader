import { leaf93, Leaf93Result } from './leaf93';
import { leaf154, Leaf154Result } from './leaf154';

export interface Mid74Result {
  results: (Leaf93Result | Leaf154Result)[];
  total: number;
}

export function mid74(seed: number): Mid74Result {
  const results: (Leaf93Result | Leaf154Result)[] = [leaf93(seed + 93), leaf154(seed + 154)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
