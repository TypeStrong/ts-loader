import { leaf27, Leaf27Result } from './leaf27';
import { leaf79, Leaf79Result } from './leaf79';
import { leaf146, Leaf146Result } from './leaf146';
import { leaf164, Leaf164Result } from './leaf164';

export interface Mid44Result {
  results: (Leaf27Result | Leaf79Result | Leaf146Result | Leaf164Result)[];
  total: number;
}

export function mid44(seed: number): Mid44Result {
  const results: (Leaf27Result | Leaf79Result | Leaf146Result | Leaf164Result)[] = [leaf27(seed + 27), leaf79(seed + 79), leaf146(seed + 146), leaf164(seed + 164)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
