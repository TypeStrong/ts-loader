import { leaf58, Leaf58Result } from './leaf58';
import { leaf60, Leaf60Result } from './leaf60';
import { leaf161, Leaf161Result } from './leaf161';

export interface Mid37Result {
  results: (Leaf58Result | Leaf60Result | Leaf161Result)[];
  total: number;
}

export function mid37(seed: number): Mid37Result {
  const results: (Leaf58Result | Leaf60Result | Leaf161Result)[] = [leaf58(seed + 58), leaf60(seed + 60), leaf161(seed + 161)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
