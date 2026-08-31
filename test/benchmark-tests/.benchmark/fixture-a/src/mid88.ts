import { leaf5, Leaf5Result } from './leaf5';
import { leaf15, Leaf15Result } from './leaf15';
import { leaf48, Leaf48Result } from './leaf48';
import { leaf123, Leaf123Result } from './leaf123';

export interface Mid88Result {
  results: (Leaf5Result | Leaf15Result | Leaf48Result | Leaf123Result)[];
  total: number;
}

export function mid88(seed: number): Mid88Result {
  const results: (Leaf5Result | Leaf15Result | Leaf48Result | Leaf123Result)[] = [leaf5(seed + 5), leaf15(seed + 15), leaf48(seed + 48), leaf123(seed + 123)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
