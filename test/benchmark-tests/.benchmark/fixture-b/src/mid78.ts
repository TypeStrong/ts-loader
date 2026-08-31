import { leaf55, Leaf55Result } from './leaf55';
import { leaf113, Leaf113Result } from './leaf113';
import { leaf120, Leaf120Result } from './leaf120';
import { leaf155, Leaf155Result } from './leaf155';

export interface Mid78Result {
  results: (Leaf55Result | Leaf113Result | Leaf120Result | Leaf155Result)[];
  total: number;
}

export function mid78(seed: number): Mid78Result {
  const results: (Leaf55Result | Leaf113Result | Leaf120Result | Leaf155Result)[] = [leaf55(seed + 55), leaf113(seed + 113), leaf120(seed + 120), leaf155(seed + 155)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
