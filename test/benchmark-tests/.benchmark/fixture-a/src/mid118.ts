import { leaf2, Leaf2Result } from './leaf2';
import { leaf103, Leaf103Result } from './leaf103';
import { leaf127, Leaf127Result } from './leaf127';

export interface Mid118Result {
  results: (Leaf2Result | Leaf103Result | Leaf127Result)[];
  total: number;
}

export function mid118(seed: number): Mid118Result {
  const results: (Leaf2Result | Leaf103Result | Leaf127Result)[] = [leaf2(seed + 2), leaf103(seed + 103), leaf127(seed + 127)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
