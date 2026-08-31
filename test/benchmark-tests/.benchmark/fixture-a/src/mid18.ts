import { leaf21, Leaf21Result } from './leaf21';
import { leaf147, Leaf147Result } from './leaf147';
import { leaf179, Leaf179Result } from './leaf179';

export interface Mid18Result {
  results: (Leaf21Result | Leaf147Result | Leaf179Result)[];
  total: number;
}

export function mid18(seed: number): Mid18Result {
  const results: (Leaf21Result | Leaf147Result | Leaf179Result)[] = [leaf21(seed + 21), leaf147(seed + 147), leaf179(seed + 179)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
