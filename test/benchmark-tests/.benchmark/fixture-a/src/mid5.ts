import { leaf5, Leaf5Result } from './leaf5';
import { leaf106, Leaf106Result } from './leaf106';

export interface Mid5Result {
  results: (Leaf5Result | Leaf106Result)[];
  total: number;
}

export function mid5(seed: number): Mid5Result {
  const results: (Leaf5Result | Leaf106Result)[] = [leaf5(seed + 5), leaf106(seed + 106)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
