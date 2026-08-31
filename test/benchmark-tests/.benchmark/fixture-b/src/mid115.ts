import { leaf11, Leaf11Result } from './leaf11';
import { leaf137, Leaf137Result } from './leaf137';
import { leaf162, Leaf162Result } from './leaf162';

export interface Mid115Result {
  results: (Leaf11Result | Leaf137Result | Leaf162Result)[];
  total: number;
}

export function mid115(seed: number): Mid115Result {
  const results: (Leaf11Result | Leaf137Result | Leaf162Result)[] = [leaf11(seed + 11), leaf137(seed + 137), leaf162(seed + 162)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
