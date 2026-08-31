import { HubValue, describeHub } from './hub';

export interface Leaf1Result {
  value: number;
  description: string;
}

export function leaf1(seed: number): Leaf1Result {
  const hubValue: HubValue = { id: seed + 1, label: 'leaf1' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
