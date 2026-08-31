import { leaf78, Leaf78Result } from './leaf78';
import { leaf104, Leaf104Result } from './leaf104';
import { leaf164, Leaf164Result } from './leaf164';

export interface Mid19Result {
  results: (Leaf78Result | Leaf104Result | Leaf164Result)[];
  total: number;
}

export function mid19(seed: number): Mid19Result {
  const results: (Leaf78Result | Leaf104Result | Leaf164Result)[] = [leaf78(seed + 78), leaf104(seed + 104), leaf164(seed + 164)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
