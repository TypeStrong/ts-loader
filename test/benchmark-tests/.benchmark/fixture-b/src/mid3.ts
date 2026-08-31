import { leaf35, Leaf35Result } from './leaf35';
import { leaf55, Leaf55Result } from './leaf55';
import { leaf90, Leaf90Result } from './leaf90';
import { leaf134, Leaf134Result } from './leaf134';

export interface Mid3Result {
  results: (Leaf35Result | Leaf55Result | Leaf90Result | Leaf134Result)[];
  total: number;
}

export function mid3(seed: number): Mid3Result {
  const results: (Leaf35Result | Leaf55Result | Leaf90Result | Leaf134Result)[] = [leaf35(seed + 35), leaf55(seed + 55), leaf90(seed + 90), leaf134(seed + 134)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
