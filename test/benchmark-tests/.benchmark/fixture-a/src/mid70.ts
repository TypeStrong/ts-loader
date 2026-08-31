import { leaf47, Leaf47Result } from './leaf47';
import { leaf120, Leaf120Result } from './leaf120';

export interface Mid70Result {
  results: (Leaf47Result | Leaf120Result)[];
  total: number;
}

export function mid70(seed: number): Mid70Result {
  const results: (Leaf47Result | Leaf120Result)[] = [leaf47(seed + 47), leaf120(seed + 120)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
