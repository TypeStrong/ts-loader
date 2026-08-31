import { HubValue, describeHub } from './hub';

export interface Leaf2Result {
  value: number;
  description: string;
}

export function leaf2(seed: number): Leaf2Result {
  const hubValue: HubValue = { id: seed + 2, label: 'leaf2' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
