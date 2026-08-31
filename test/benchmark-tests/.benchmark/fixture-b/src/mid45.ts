import { leaf81, Leaf81Result } from './leaf81';
import { leaf94, Leaf94Result } from './leaf94';
import { leaf151, Leaf151Result } from './leaf151';
import { leaf161, Leaf161Result } from './leaf161';

export interface Mid45Result {
  results: (Leaf81Result | Leaf94Result | Leaf151Result | Leaf161Result)[];
  total: number;
}

export function mid45(seed: number): Mid45Result {
  const results: (Leaf81Result | Leaf94Result | Leaf151Result | Leaf161Result)[] = [leaf81(seed + 81), leaf94(seed + 94), leaf151(seed + 151), leaf161(seed + 161)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
