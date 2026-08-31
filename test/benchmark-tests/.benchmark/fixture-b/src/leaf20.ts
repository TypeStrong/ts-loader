import { HubValue, describeHub } from './hub';

export interface Leaf20Result {
  value: number;
  description: string;
}

export function leaf20(seed: number): Leaf20Result {
  const hubValue: HubValue = { id: seed + 20, label: 'leaf20' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
