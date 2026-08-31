import { leaf36, Leaf36Result } from './leaf36';
import { leaf62, Leaf62Result } from './leaf62';
import { leaf93, Leaf93Result } from './leaf93';
import { leaf149, Leaf149Result } from './leaf149';

export interface Mid111Result {
  results: (Leaf36Result | Leaf62Result | Leaf93Result | Leaf149Result)[];
  total: number;
}

export function mid111(seed: number): Mid111Result {
  const results: (Leaf36Result | Leaf62Result | Leaf93Result | Leaf149Result)[] = [leaf36(seed + 36), leaf62(seed + 62), leaf93(seed + 93), leaf149(seed + 149)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
