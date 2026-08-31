import { leaf7, Leaf7Result } from './leaf7';
import { leaf17, Leaf17Result } from './leaf17';
import { leaf30, Leaf30Result } from './leaf30';
import { leaf93, Leaf93Result } from './leaf93';

export interface Mid86Result {
  results: (Leaf7Result | Leaf17Result | Leaf30Result | Leaf93Result)[];
  total: number;
}

export function mid86(seed: number): Mid86Result {
  const results: (Leaf7Result | Leaf17Result | Leaf30Result | Leaf93Result)[] = [leaf7(seed + 7), leaf17(seed + 17), leaf30(seed + 30), leaf93(seed + 93)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
