import { leaf17, Leaf17Result } from './leaf17';
import { leaf43, Leaf43Result } from './leaf43';
import { leaf62, Leaf62Result } from './leaf62';
import { leaf112, Leaf112Result } from './leaf112';

export interface Mid90Result {
  results: (Leaf17Result | Leaf43Result | Leaf62Result | Leaf112Result)[];
  total: number;
}

export function mid90(seed: number): Mid90Result {
  const results: (Leaf17Result | Leaf43Result | Leaf62Result | Leaf112Result)[] = [leaf17(seed + 17), leaf43(seed + 43), leaf62(seed + 62), leaf112(seed + 112)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
