import { leaf17, Leaf17Result } from './leaf17';
import { leaf101, Leaf101Result } from './leaf101';
import { leaf135, Leaf135Result } from './leaf135';
import { leaf173, Leaf173Result } from './leaf173';

export interface Mid67Result {
  results: (Leaf17Result | Leaf101Result | Leaf135Result | Leaf173Result)[];
  total: number;
}

export function mid67(seed: number): Mid67Result {
  const results: (Leaf17Result | Leaf101Result | Leaf135Result | Leaf173Result)[] = [leaf17(seed + 17), leaf101(seed + 101), leaf135(seed + 135), leaf173(seed + 173)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
