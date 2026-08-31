import { leaf24, Leaf24Result } from './leaf24';
import { leaf179, Leaf179Result } from './leaf179';

export interface Mid108Result {
  results: (Leaf24Result | Leaf179Result)[];
  total: number;
}

export function mid108(seed: number): Mid108Result {
  const results: (Leaf24Result | Leaf179Result)[] = [leaf24(seed + 24), leaf179(seed + 179)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
