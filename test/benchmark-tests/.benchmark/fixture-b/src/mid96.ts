import { leaf5, Leaf5Result } from './leaf5';
import { leaf61, Leaf61Result } from './leaf61';
import { leaf116, Leaf116Result } from './leaf116';
import { leaf132, Leaf132Result } from './leaf132';

export interface Mid96Result {
  results: (Leaf5Result | Leaf61Result | Leaf116Result | Leaf132Result)[];
  total: number;
}

export function mid96(seed: number): Mid96Result {
  const results: (Leaf5Result | Leaf61Result | Leaf116Result | Leaf132Result)[] = [leaf5(seed + 5), leaf61(seed + 61), leaf116(seed + 116), leaf132(seed + 132)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
