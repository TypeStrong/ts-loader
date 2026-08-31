import { leaf44, Leaf44Result } from './leaf44';
import { leaf85, Leaf85Result } from './leaf85';
import { leaf155, Leaf155Result } from './leaf155';

export interface Mid2Result {
  results: (Leaf44Result | Leaf85Result | Leaf155Result)[];
  total: number;
}

export function mid2(seed: number): Mid2Result {
  const results: (Leaf44Result | Leaf85Result | Leaf155Result)[] = [leaf44(seed + 44), leaf85(seed + 85), leaf155(seed + 155)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
