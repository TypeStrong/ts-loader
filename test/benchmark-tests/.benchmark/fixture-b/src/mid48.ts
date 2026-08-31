import { leaf88, Leaf88Result } from './leaf88';
import { leaf133, Leaf133Result } from './leaf133';
import { leaf151, Leaf151Result } from './leaf151';
import { leaf154, Leaf154Result } from './leaf154';

export interface Mid48Result {
  results: (Leaf88Result | Leaf133Result | Leaf151Result | Leaf154Result)[];
  total: number;
}

export function mid48(seed: number): Mid48Result {
  const results: (Leaf88Result | Leaf133Result | Leaf151Result | Leaf154Result)[] = [leaf88(seed + 88), leaf133(seed + 133), leaf151(seed + 151), leaf154(seed + 154)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
