import { leaf103, Leaf103Result } from './leaf103';
import { leaf178, Leaf178Result } from './leaf178';

export interface Mid34Result {
  results: (Leaf103Result | Leaf178Result)[];
  total: number;
}

export function mid34(seed: number): Mid34Result {
  const results: (Leaf103Result | Leaf178Result)[] = [leaf103(seed + 103), leaf178(seed + 178)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
