import { leaf48, Leaf48Result } from './leaf48';
import { leaf112, Leaf112Result } from './leaf112';
import { leaf154, Leaf154Result } from './leaf154';
import { leaf163, Leaf163Result } from './leaf163';

export interface Mid89Result {
  results: (Leaf48Result | Leaf112Result | Leaf154Result | Leaf163Result)[];
  total: number;
}

export function mid89(seed: number): Mid89Result {
  const results: (Leaf48Result | Leaf112Result | Leaf154Result | Leaf163Result)[] = [leaf48(seed + 48), leaf112(seed + 112), leaf154(seed + 154), leaf163(seed + 163)];
  return {
    results,
    total: results.reduce((sum, r) => sum + r.value, 0),
  };
}
