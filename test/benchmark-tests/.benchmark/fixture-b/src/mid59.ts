import { leaf35, Leaf35Result } from './leaf35';
import { leaf79, Leaf79Result } from './leaf79';
import { leaf93, Leaf93Result } from './leaf93';
import { leaf119, Leaf119Result } from './leaf119';

export interface Mid59Result {
  results: (Leaf35Result | Leaf79Result | Leaf93Result | Leaf119Result)[];
  total: number;
}

export function mid59(seed: number): Mid59Result {
  const results: (Leaf35Result | Leaf79Result | Leaf93Result | Leaf119Result)[] = [leaf35(seed + 35), leaf79(seed + 79), leaf93(seed + 93), leaf119(seed + 119)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
