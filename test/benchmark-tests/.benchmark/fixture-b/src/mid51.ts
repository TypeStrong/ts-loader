import { leaf107, Leaf107Result } from './leaf107';
import { leaf113, Leaf113Result } from './leaf113';
import { leaf150, Leaf150Result } from './leaf150';
import { leaf153, Leaf153Result } from './leaf153';

export interface Mid51Result {
  results: (Leaf107Result | Leaf113Result | Leaf150Result | Leaf153Result)[];
  total: number;
}

export function mid51(seed: number): Mid51Result {
  const results: (Leaf107Result | Leaf113Result | Leaf150Result | Leaf153Result)[] = [leaf107(seed + 107), leaf113(seed + 113), leaf150(seed + 150), leaf153(seed + 153)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
