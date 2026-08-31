import { HubValue, describeHub } from './hub';

export interface Leaf95Result {
  value: number;
  description: string;
}

export function leaf95(seed: number): Leaf95Result {
  const hubValue: HubValue = { id: seed + 95, label: 'leaf95' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
