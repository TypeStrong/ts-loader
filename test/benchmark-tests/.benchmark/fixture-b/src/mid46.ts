import { leaf111, Leaf111Result } from './leaf111';
import { leaf145, Leaf145Result } from './leaf145';

export interface Mid46Result {
  results: (Leaf111Result | Leaf145Result)[];
  total: number;
}

export function mid46(seed: number): Mid46Result {
  const results: (Leaf111Result | Leaf145Result)[] = [leaf111(seed + 111), leaf145(seed + 145)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
