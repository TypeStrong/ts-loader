import { leaf98, Leaf98Result } from './leaf98';
import { leaf106, Leaf106Result } from './leaf106';
import { leaf109, Leaf109Result } from './leaf109';

export interface Mid38Result {
  results: (Leaf98Result | Leaf106Result | Leaf109Result)[];
  total: number;
}

export function mid38(seed: number): Mid38Result {
  const results: (Leaf98Result | Leaf106Result | Leaf109Result)[] = [leaf98(seed + 98), leaf106(seed + 106), leaf109(seed + 109)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
