import { leaf13, Leaf13Result } from './leaf13';
import { leaf110, Leaf110Result } from './leaf110';
import { leaf161, Leaf161Result } from './leaf161';

export interface Mid16Result {
  results: (Leaf13Result | Leaf110Result | Leaf161Result)[];
  total: number;
}

export function mid16(seed: number): Mid16Result {
  const results: (Leaf13Result | Leaf110Result | Leaf161Result)[] = [leaf13(seed + 13), leaf110(seed + 110), leaf161(seed + 161)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
