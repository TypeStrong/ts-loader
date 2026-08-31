import { leaf132, Leaf132Result } from './leaf132';
import { leaf154, Leaf154Result } from './leaf154';

export interface Mid11Result {
  results: (Leaf132Result | Leaf154Result)[];
  total: number;
}

export function mid11(seed: number): Mid11Result {
  const results: (Leaf132Result | Leaf154Result)[] = [leaf132(seed + 132), leaf154(seed + 154)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
