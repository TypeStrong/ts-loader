import { leaf121, Leaf121Result } from './leaf121';
import { leaf136, Leaf136Result } from './leaf136';
import { leaf178, Leaf178Result } from './leaf178';

export interface Mid50Result {
  results: (Leaf121Result | Leaf136Result | Leaf178Result)[];
  total: number;
}

export function mid50(seed: number): Mid50Result {
  const results: (Leaf121Result | Leaf136Result | Leaf178Result)[] = [leaf121(seed + 121), leaf136(seed + 136), leaf178(seed + 178)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
